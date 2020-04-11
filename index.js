const express = require("express");
const app = express();

const DEFAULT_TILE_SIZE_Y = 50;
const DEFAULT_TILE_SIZE_X = DEFAULT_TILE_SIZE_Y + DEFAULT_TILE_SIZE_Y * 0.2;

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

let once = false;
async function process(data, options) {
  const gameObjects = JSON.parse(data);
  // console.log(">>GemBotServer/index::", "gameObjects", gameObjects); //TRACE
  const { player, mobs, items } = parseObjects(gameObjects);
  console.log(">>GemBotServer/index::", "player,mobs", player); //TRACE

  // res.send(JSON.stringify({ x: 380.8, y: 681.45 }));
  // res.send(JSON.stringify({ x: 350.8, y: 651.45 }));

  // res.send(JSON.stringify({ x: 500.8, y: 601.45 }));


  // if (once) {
  //   return { sleep: 5000 };
  // }

  // options.center.x -= DEFAULT_TILE_SIZE_X * 3;

  // once = { ...options.center, sleep: 5000 };
  once = { sleep: 2000 };
  return once;
}

function parseOption(opt) {
  const options = JSON.parse(opt);
  const center = {
    x: options.width / 2,
    y: options.height / 2 - DEFAULT_TILE_SIZE_Y,
  };

  return { ...options, center };
}

app.post("/xy", async function (req, res) {
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

function getDiff(pointA, pointB) {
  return {
    x: pointA.x - pointB.x,
    y: pointA.y - pointB.y,
  };
}

require("./lib/read-map")("moc_fild12");
