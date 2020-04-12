const express = require("express");
const app = express();
const pathFinder = require("./lib/path-finder");
const sortBy = require("lodash/sortBy");

const DEFAULT_TILE_SIZE_Y = 30;
const DEFAULT_TILE_SIZE_X = 36;

const DEFAULT_MAP = "moc_fild12";

function parseObjects(gameObjects = []) {
  let player = {},
    mobs = [],
    items = [];
  gameObjects.forEach((e) => {
    switch (e.type) {
      case "PC":
        player = e;
        break;
      case "MOB":
        mobs.push(e);
        break;
      case "ITEM":
        items.push(e);
        break;
    }
  });

  return { player, mobs, items };
}

function getTargetMob(player, mobs) {
  if (!mobs || mobs.length < 1) return;
  const list = sortBy(mobs, (mob) => {
    if (mob.status === "DEAD") return 99999;
    const dist = getDistance(player, mob);
    return dist;
  });
  return list[0];
}

async function process(data, options) {
  const gameObjects = JSON.parse(data);
  // console.log(">>GemBotServer/index::", "gameObjects", gameObjects); //TRACE
  const { player, mobs, items } = parseObjects(gameObjects);
  // console.log(">>GemBotServer/index::", "player", player); //TRACE
  // return { sleep: 3000 };
  if (player.status === "ATK1") return { sleep: 1000 };

  const targetMob = getTargetMob(player, mobs);
  const targetItems = items;

  if (targetItems.length > 0) return { clickAction: true, sleep: 400 };

  if (player.status === "WALK" && targetMob) return { sleep: 150 };

  let targetPoint;
  if (targetMob) {
    console.log(">>GemBotServer/index::", "targetMob", targetMob.name); //TRACE
    targetPoint = { x: targetMob.x, y: targetMob.y };
  } else {
    console.log(">>GemBotServer/index::", "no target"); //TRACE
  }
  if (targetItems.length > 0) {
    targetPoint = { x: targetItems[0].x, y: targetItems[0].y };
  }
  console.log(">>GemBotServer/index::", "player pos", player.x, player.y); //TRACE

  let nextPoints;
  let patrolling = false,
    tooFar = false;
  if (targetPoint) {
    const targetDistance = getDistance(targetPoint, player);
    console.log(">>GemBotServer/index::", "distance", targetDistance); //TRACE
    // if (targetDistance > 0) {
    nextPoints = pathFinder({
      mapName: DEFAULT_MAP,
      from: player,
      to: {
        x: targetPoint.x,
        y: targetPoint.y,
      },
      // allowClickSelf: targetItems.length > 0,
    });
    if (nextPoints.toFar) tooFar = true;
    // } else {
    //   tooFar = true;
    // }
  }
  if (!targetPoint || tooFar) {
    patrolling = true;
    nextPoints = pathFinder({
      mapName: DEFAULT_MAP,
      from: player,
      to: "PATROL",
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

  console.log(
    ">>GemBotServer/index::",
    "clickPoint",
    points.length,
    player.x,
    player.y
  ); //TRACE

  // const dist = getDiff(player, targetMob);
  // if (Math.abs(dist.x) < 2 && Math.abs(dist.y) < 2) return { sleep: 5000 };

  // if (targetMob) return { points, sleep: 500 };
  if (targetPoint) return { points, sleep: 500 };
  if (patrolling) {
    let thePoints = points;
    console.log(">>GemBotServer/index::", "player.status", player.status); //TRACE
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
  // console.log(">>GemBotServer/index::", "hello"); //TRACE
  // return res.send(JSON.stringify({ clickAction: true, sleep: 1000 }));
  let response = {};
  const options = parseOption(req.query.q2);

  if (req.query.q) {
    response = await process(req.query.q, options);
  }
  // console.log(">>GemBotServer/index::", "response", response, options); //TRACE
  return res.send(JSON.stringify(response));
});

app.listen(4566, "0.0.0.0", () => {
  console.log(">>GemBotServer/index::", "started", 4566); //TRACE
});

function getDistance(pointA, pointB) {
  const a = pointA.x - pointB.x;
  const b = pointA.y - pointB.y;
  return Math.sqrt(a * a + b * b);
}

function getDiff(pointA, pointB) {
  return {
    x: pointA.x - pointB.x,
    y: pointA.y - pointB.y,
  };
}

function toScreenCoords({ player, center, point }) {
  const diff = getDiff(point, player);
  // console.log(">>GemBotServer/index::", "diff", diff); //TRACE
  return {
    x: center.x + diff.x * DEFAULT_TILE_SIZE_X,
    y: center.y - (diff.y * DEFAULT_TILE_SIZE_Y + DEFAULT_TILE_SIZE_Y),
  };
}
