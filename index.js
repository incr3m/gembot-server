const express = require("express");
const app = express();
const pathFinder = require("./lib/path-finder");
const sortBy = require("lodash/sortBy");
const { getDiff, getDistance } = require("./lib/pointing");
const jsonService = require("./lib/json-service");
const initMap = require("./lib/init-map");
const debug = require("./lib/debug");
const cors = require("cors");
const bodyParser = require("body-parser");
const lrandom = require("lodash/random");

const DEFAULT_TILE_SIZE_Y = 30;
const DEFAULT_TILE_SIZE_X = 36;

const CHECKS = {};
const ERRORS = {};

const BATTLESTATUS = ["TAKEDAMAGE", "BATTLESTANCE", "ATK1", "ATK2"];

function statsCheck({ deviceId, player }) {
  // check if moving
  const posKey = `${deviceId}::pos`;
  const pos = CHECKS[posKey];
  const ts = Date.now();
  [oldX, oldY, oldTs] = (pos || "").split(":");
  if (Number(oldX) === player.x && Number(oldY) === player.y) {
    const timeDiff = ts - oldTs;
    if (timeDiff > 30 * 1000) {
      console.log(
        ">>GemBotServer/index::",
        deviceId,
        "pos check failed",
        timeDiff
      ); //TRACE
      // return { error: { vibrate: 1000, sleep: 5000 } };
      return { error: "NOT_MOVING_30" };
    } else if (timeDiff > 10 * 1000) {
      console.log(
        ">>GemBotServer/index::",
        deviceId,
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

function parseObjects(gameObjects = [], options) {
  let player = {},
    mobs = [],
    npc = [],
    avoid = [],
    aggro = [];
  items = [];
  const deviceId = options.id;
  gameObjects.forEach((e) => {
    debug(deviceId, ">>GemBotServer/index::", "obj", e.name, e.status, e.type); //TRACE

    const evadeList = jsonService.get(deviceId, `evade`, []);
    let evadeRegx;
    if (evadeList.length > 0) {
      evadeRegx = new RegExp(evadeList.join("|"));
    }

    switch (e.type) {
      case "PC":
        if (getDistance(e, { x: options.plr_x, y: options.plr_y }) < 5)
          player = e;
        else npc.push(e);
        break;
      case "MOB":
        if (evadeRegx && evadeRegx.test(e.name)) avoid.push(e);
        if (BATTLESTATUS.includes(e.status)) aggro.push(e);
        if (!e.name.includes("npc")) mobs.push(e);
        break;
      case "ITEM":
        items.push(e);
        break;
    }
  });
  if (!player.name && npc.length > 0) {
    player = npc.pop();
  }
  const [currentHP, _1, maxHP] = options.plr_hp.split(" ");
  const [currentSP, _2, maxSP] = options.plr_sp.split(" ");
  player.vitals = {
    currentHP,
    maxHP,
    currentSP,
    maxSP,
  };

  return { player, mobs, items, avoid, aggro };
}

function getTargetMob(player, mobs, deviceId) {
  if (!mobs || mobs.length < 1) return;
  if (!jsonService.get(deviceId)) return;
  const huntList = jsonService.get(deviceId, `hunt`, []);
  if (huntList.length < 1) return;

  const allHunt = huntList[0] === "*";
  const mobHUnt = !allHunt && new RegExp(huntList.join("|"));
  const list = sortBy(
    mobs.filter((mob) => {
      // const isKill = !mob.name.includes("Creamy");
      let isKill;
      if (allHunt) isKill = true;
      else {
        const mobNameLower = mob.name.toLowerCase();
        isKill = mobHUnt.test(mobNameLower);
        debug(
          deviceId,
          ">>GemBotServer/index::",
          "isKill",
          isKill,
          mobNameLower,
          mobHUnt
        ); //TRACE
      }
      return isKill || (!isKill && BATTLESTATUS.includes(mob.status));
    }),
    (mob) => {
      if (BATTLESTATUS.includes(mob.status)) return 0;
      if (mob.status === "DEAD") return 99999;
      const dist = getDistance(player, mob);
      mob.distance = dist;
      return dist;
    }
  );
  return list[0];
}

function getTargetItem(player, items, deviceId) {
  if (!items || items.length < 1) return;
  if (!jsonService.get(deviceId)) return;
  const itemHuntList = jsonService.get(deviceId, "itemExclude", []);

  let itemAvoidRgx;
  if (itemHuntList.length > 0)
    itemAvoidRgx = new RegExp(itemHuntList.join("|"));
  const pickUp = items.filter((item) => {
    const { name = "" } = item;
    if (ERRORS[deviceId])
      console.log(deviceId, ">>GemBotServer/index::", "item:", name); //TRACE
    if (!itemAvoidRgx) return true;
    return !itemAvoidRgx.test(name);
  });
  return pickUp || [];
}

async function process(data, options) {
  const deviceId = options.id;
  // console.log('>>GemBotServer/index::','deviceId', deviceId); //TRACE
  const deviceMapping = jsonService.get(deviceId);
  if (!deviceMapping || deviceMapping.disabled) {
    console.log(
      deviceId,
      ">>GemBotServer/index::",
      "NO DEVICE MAPPING FOR ",
      deviceId
    ); //TRACE
    return { sleep: 20000 };
  }
  jsonService.set(deviceId, "map", options.plr_map);
  const mapName = jsonService.get(deviceId, "map");

  if (deviceMapping.FORCE_CLICK) {
    const [x, y] = deviceMapping.FORCE_CLICK.split(",");
    return {
      x,
      y,
      sleep: 3000,
    };
  }

  let targetPoint, travelPoint;

  if (deviceMapping.TRAVEL) {
    travelPoint = require("./lib/travel-helper").getPoint(
      deviceMapping.TRAVEL,
      mapName
    );
    // console.log(">>GemBotServer/index::", "travelPoint", mapName, travelPoint); //TRACE
  }

  const gameObjects = JSON.parse(data);
  // debug(deviceId,">>GemBotServer/index::", "gameObjects", gameObjects); //TRACE
  const { player, mobs, items, avoid, aggro } = parseObjects(
    gameObjects,
    options
  );

  const mightBeHiding = !player.x || !player.y;
  const shouldRun = aggro.length > 4;

  if (mightBeHiding) {
    if (mobs.length < 4) return { clickHotkey: 1, sleep: 500 };
    else return { sleep: 5000 };
  }

  if (shouldRun || avoid.length > 0) {
    return { clickHotkey: 1, sleep: 10000 };
  }

  if (player) {
    if (player.vitals.maxHP - player.vitals.currentHP > 500)
      return { clickHotkey: [0, 2][lrandom(0, 1)], sleep: 400 };
  }

  const checks = statsCheck({ deviceId, player });
  if (checks.error) ERRORS[deviceId] = checks.error;
  else delete ERRORS[deviceId];
  jsonService.set(deviceId, "ERRORS", ERRORS[deviceId]);
  ////////////////////////

  jsonService.set(deviceId, "game", { player, mobs, items });

  let targetMob, targetItems;
  if (!travelPoint) {
    targetMob = getTargetMob(player, mobs, deviceId);
    targetItems = getTargetItem(player, items, deviceId);
  }

  if (
    !shouldRun &&
    // BATTLESTATUS.includes(player.status) &&
    targetMob &&
    targetMob.distance < 2
  ) {
    CHECKS[`${deviceId}::pos`] = "";
    return { sleep: 1000 };
  }

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
        if (!shouldRun && deviceMapping.allowAlerts)
          return { vibrate: 1000, sleep: 5000 };
      case "NOT_MOVING_10":
        if (errDevId === deviceId) targetPoint = null; //should patrol
        break;
    }
    // return Object.values(ERRORS)[0];
  }

  let nextPoints;
  let patrolling = false,
    tooFar = false;

  if (shouldRun) {
    console.log(">>GemBotServer/index::", "run"); //TRACE
    targetPoint = null;
  }

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
  if (travelPoint) {
    patrolling = true;
    nextPoints = pathFinder({
      mapName,
      from: player,
      to: travelPoint,
      deviceId,
      travel: true,
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
    return { points: thePoints, sleep: 150 };
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

app.use(bodyParser.json());
app.use(cors());

app.post("/xy", async function (req, res) {
  // debug(deviceId,">>GemBotServer/index::", "hello"); //TRACE
  // return res.send(JSON.stringify({ clickHotkey: 0, sleep: 5000 }));
  let response = {};
  const options = parseOption(req.query.q2); //{"id":"8006baab5f937fd8","height":1280,"width":720}
  // console.log(">>GemBotServer/index::", "req.query", req.query); //TRACE
  if (req.query.q) {
    await initMap(options.plr_map);
    response = await process(req.query.q, options);
  }
  // debug(deviceId,">>GemBotServer/index::", "response", response, options); //TRACE
  return res.send(JSON.stringify(response));
});

app.get("/devices", async function (req, res) {
  const fields = (req.query.fields || "").split(",");
  return res.send(
    JSON.stringify(jsonService.ids([...fields, "FORCE_CLICK", "TRAVEL"]))
  );
});

app.post("/save", async function (req, res) {
  const { body, query } = req;
  jsonService.save(query.deviceId, body);
  res.send({ ok: 1 });
});

app.post("/set", async function (req, res) {
  const { body, query } = req;
  jsonService.set(query.deviceId, query.field, body.value, true);
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
