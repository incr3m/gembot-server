const express = require("express");
const app = express();
const pathFinder = require("./lib/path-finder");
const sortBy = require("lodash/sortBy");
const { getDiff, getDistance } = require("./lib/pointing");
const jsonService = require("./lib/json-service");
const debug = require("./lib/debug");
const cors = require("cors");

const DEFAULT_TILE_SIZE_Y = 30;
const DEFAULT_TILE_SIZE_X = 36;

const CHECKS = {};
const ERRORS = {};

function statsCheck({ deviceId, player }) {
  // check if moving
  const posKey = `${deviceId}::pos`;
  const pos = CHECKS[posKey];
  const ts = Date.now();
  [oldX, oldY, oldTs] = (pos || "").split(":");
  if (Number(oldX) === player.x && Number(oldY) === player.y) {
    const timeDiff = ts - oldTs;
    if (timeDiff > 30 * 1000) {
      console.log(">>GemBotServer/index::", "pos check failed", timeDiff); //TRACE
      // return { error: { vibrate: 1000, sleep: 5000 } };
      return { error: "NOT_MOVING_30" };
    } else if (timeDiff > 10 * 1000) {
      console.log(
        ">>GemBotServer/index::",
        "pos check failed",
        timeDiff,
        player
      ); //TRACE
      // return { error: { vibrate: 1000, sleep: 5000 } };
      return { error: "NOT_MOVING_10" };
    }
  } else CHECKS[posKey] = player.x + ":" + player.y + ":" + ts;

  return { ok: true };
}

function parseObjects(gameObjects = [], deviceId) {
  let player = {},
    mobs = [],
    items = [];
  gameObjects.forEach((e) => {
    debug(deviceId, ">>GemBotServer/index::", "obj", e.name, e.status, e.type); //TRACE
    switch (e.type) {
      case "PC":
        player = e;
        break;
      case "MOB":
        if (!e.name.includes("npc")) mobs.push(e);
        break;
      case "ITEM":
        items.push(e);
        break;
    }
  });

  return { player, mobs, items };
}

function getTargetMob(player, mobs, deviceId) {
  if (!mobs || mobs.length < 1) return;
  if (!jsonService.get(deviceId)) return;
  const huntList = jsonService.get(deviceId, `hunt`, []);
  if (huntList.length < 1) return;

  const mobHUnt = new RegExp(huntList.join("|"));
  const list = sortBy(
    mobs.filter((mob) => {
      // const isKill = !mob.name.includes("Creamy");
      const mobNameLower = mob.name.toLowerCase();
      const isKill = mobHUnt.test(mobNameLower);
      debug(
        deviceId,
        ">>GemBotServer/index::",
        "isKill",
        isKill,
        mobNameLower,
        mobHUnt
      ); //TRACE
      return (
        isKill ||
        (!isKill &&
          ["TAKEDAMAGE", "BATTLESTANCE", "ATK1", "ATK2"].includes(mob.status))
      );
    }),
    (mob) => {
      if (["TAKEDAMAGE", "BATTLESTANCE", "ATK1", "ATK2"].includes(mob.status))
        return 0;
      if (mob.status === "DEAD") return 99999;
      const dist = getDistance(player, mob);
      return dist;
    }
  );
  return list[0];
}

function getTargetItem(player, items, deviceId) {
  if (!items || items.length < 1) return;
  if (!jsonService.get(deviceId)) return;
  const itemHuntList = jsonService.get(deviceId, "itemExclude", []);
  if (itemHuntList.length < 1) return;

  const itemAvoidRgx = new RegExp(itemHuntList.join("|"));
  const pickUp = items.filter((item) => {
    const { name = "" } = item;
    debug(deviceId, ">>GemBotServer/index::", "item:", name); //TRACE
    return !itemAvoidRgx.test(name);
  });
  return pickUp || [];
}

async function process(data, options) {
  const deviceId = options.id;
  const deviceMapping = jsonService.get(deviceId);
  if (!deviceMapping || deviceMapping.disabled) {
    debug(
      deviceId,
      ">>GemBotServer/index::",
      "NO DEVICE MAPPING FOR ",
      deviceId
    ); //TRACE
    return { sleep: 20000 };
  }

  const gameObjects = JSON.parse(data);
  // debug(deviceId,">>GemBotServer/index::", "gameObjects", gameObjects); //TRACE
  const { player, mobs, items } = parseObjects(gameObjects, deviceId);
  // debug(deviceId,">>GemBotServer/index::", "gameObjects", gameObjects); //TRACE
  // debug(deviceId,">>GemBotServer/index::", "player", player); //TRACE
  const checks = statsCheck({ deviceId, player });
  if (checks.error) ERRORS[deviceId] = checks.error;
  else delete ERRORS[deviceId];
  jsonService.set(deviceId, "ERRORS", ERRORS[deviceId]);
  ////////////////////////

  jsonService.set(deviceId, "game", { player, mobs, items });
  if (player.status === "ATK1") return { sleep: 1000 };

  const targetMob = getTargetMob(player, mobs, deviceId);
  const targetItems = getTargetItem(player, items, deviceId);
  let targetPoint;

  const hasItemsToPickup = targetItems && targetItems.length > 0;

  if (hasItemsToPickup) {
    if (deviceMapping.pickUpTap) {
      targetPoint = { x: items[0].x, y: items[0].y };
    } else return { clickAction: true, sleep: 400 };
  }

  if (player.status === "WALK" && targetMob) return { sleep: 150 };

  if (targetMob) {
    targetPoint = { x: targetMob.x, y: targetMob.y };
  } else {
    debug(deviceId, ">>GemBotServer/index::", "no target"); //TRACE
  }

  if (
    /* DEVICE_MAPPING[deviceId].allowAlerts && */ Object.keys(ERRORS).length > 0
  ) {
    const [errDevId, errorName] = Object.entries(ERRORS)[0];
    switch (errorName) {
      case "NOT_MOVING_30":
        if (deviceMapping.allowAlerts) return { vibrate: 1000, sleep: 5000 };
      case "NOT_MOVING_10":
        if (errDevId === deviceId) targetPoint = null; //should patrol
        break;
    }
    // return Object.values(ERRORS)[0];
  }

  //clear errors for this device
  // delete ERRORS[deviceId];

  // targetPoint = { x: player.x, y: player.y };

  let nextPoints;
  let patrolling = false,
    tooFar = false;
  const mapName = jsonService.get(deviceId, "map");

  if (targetPoint) {
    const targetDistance = getDistance(targetPoint, player);
    debug(deviceId, ">>GemBotServer/index::", "distance", targetDistance); //TRACE
    // if (targetDistance > 0) {
    nextPoints = pathFinder({
      mapName,
      from: player,
      to: {
        x: targetPoint.x,
        y: targetPoint.y,
      },
      deviceId,
      // allowClickSelf: targetItems.length > 0,
    });
    if (nextPoints && nextPoints.toFar) tooFar = true;
    // } else {
    //   tooFar = true;
    // }
  }
  if (!targetPoint || tooFar) {
    patrolling = true;
    nextPoints = pathFinder({
      mapName,
      from: player,
      to: "PATROL",
      deviceId,
    });
  }

  if (!nextPoints || nextPoints.length < 1) return { sleep: 2000 };

  const points = nextPoints.map((nextPoint) => {
    return toScreenCoords({
      player,
      center: options.center,
      point: { x: nextPoint.x, y: nextPoint.y },
    });
  });

  // debug(deviceId,
  //   ">>GemBotServer/index::",
  //   "clickPoint",
  //   points.length,
  //   player.x,
  //   player.y
  // ); //TRACE

  // const dist = getDiff(player, targetMob);
  // if (Math.abs(dist.x) < 2 && Math.abs(dist.y) < 2) return { sleep: 5000 };
  debug(
    deviceId,
    ">>GemBotServer/index::",
    "player::: ",
    player.status,
    player.x,
    player.y
  ); //TRACE

  // if (targetMob) return { points, sleep: 500 };
  if (targetPoint) return { points, sleep: 400 };
  if (patrolling) {
    let thePoints = points;
    // if (hasItemsToPickup) {
    //   thePoints = thePoints.slice(0, 4);
    // }
    if (player.status === "WALK" && points.length > 3) {
      thePoints = thePoints.slice(3);
    }
    return { points: thePoints, sleep: 200 };
  }

  return { points, sleep: 2000 };
}

function parseOption(opt) {
  const options = JSON.parse(opt);
  const center = {
    x: options.width / 2,
    y: options.height / 2,
  };

  return { ...options, center };
}

app.post("/xy", async function (req, res) {
  // debug(deviceId,">>GemBotServer/index::", "hello"); //TRACE
  // return res.send(JSON.stringify({ clickAction: true, sleep: 1000 }));
  let response = {};
  const options = parseOption(req.query.q2); //{"id":"8006baab5f937fd8","height":1280,"width":720}
  // debug(deviceId,'>>GemBotServer/index::','req.query', req.query); //TRACE
  if (req.query.q) {
    response = await process(req.query.q, options);
  }
  // debug(deviceId,">>GemBotServer/index::", "response", response, options); //TRACE
  return res.send(JSON.stringify(response));
});

app.use(cors());

app.get("/devices", async function (req, res) {
  const fields = (req.query.fields || "").split(",");
  return res.send(JSON.stringify(jsonService.ids(fields)));
});

app.post("/save", async function (req, res) {
  const { body, query } = req;
  jsonService.save(query.deviceId, JSON.parse(body));
  res.send({ ok: 1 });
});

app.post("/reset", async function (req, res) {
  jsonService.reset(req.query.deviceId);
  res.send({ ok: 1 });
});

app.listen(4566, "0.0.0.0", () => {
  console.log(">>GemBotServer/index::", "started", 4566); //TRACE
});

function toScreenCoords({ player, center, point }) {
  const diff = getDiff(point, player);
  // debug(deviceId,">>GemBotServer/index::", "diff", diff); //TRACE
  return {
    x: center.x + diff.x * DEFAULT_TILE_SIZE_X,
    y: center.y - (diff.y * DEFAULT_TILE_SIZE_Y + DEFAULT_TILE_SIZE_Y),
  };
}
