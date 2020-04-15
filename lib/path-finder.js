const fs = require("fs");
const path = require("path");
const PF = require("pathfinding");
const last = require("lodash/last");
const random = require("lodash/random");
const debug = require("./debug");
const { getDiff, getDistance } = require("./pointing");

const PLOT_MAP = false;

const gridCache = {};
const patrollableCache = {};
const playerDest = {};

module.exports = function ({
  mapName,
  from,
  to: toPoint,
  length = 10,
  allowClickSelf = false,
  deviceId = "pc",
}) {
  // x: 117,
  // y: 151,
  // width 320
  // height 400
  // FLDFile.data[y * FLDFile.width + x]
  // console.log(">>lib/readMap::", "res", map.length); //TRACE
  let to = toPoint;
  // let to = { x: 29, y: 172 };
  debug(deviceId, ">>lib/path-finder::", "from,to", from.x, from.y, to); //TRACE
  const mapConfig = require(`../maps/${mapName}.json`);
  const map = fs.readFileSync(
    path.join(__dirname, "..", "maps", mapName + ".fld")
  );

  let grid = gridCache[mapName];
  const blocks = mapConfig.blocks || {};

  function checkInBlock(x, y) {
    return blocks[`${x}:${y}`];
  }

  function checkWalkable(x, y, skipBlockCheck = false) {
    if (skipBlockCheck) return [0, 3].includes(map[y * mapConfig.width + x]);
    return [0, 3].includes(map[y * mapConfig.width + x]) && !checkInBlock(x, y);
  }

  let cx = from.x,
    cy = from.y;
  const xx = cx + mapConfig.offsetX,
    yy = cy + mapConfig.offsetY;

  const isInBlock = checkInBlock(xx, yy);
  const walkableFrom = checkWalkable(xx, yy); //map[yy * mapConfig.width + xx] < 1;

  // console.time("matrix");

  if (!grid) {
    const matrix = [];
    const patrollablePoints = [];
    let str = "";
    for (let y = 0; y < mapConfig.height; y++) {
      const line = [];
      for (let x = 0; x < mapConfig.width; x++) {
        const walkable = checkWalkable(x, y, isInBlock); //all is walkable if in block
        line.push(walkable ? 0 : 1);
        if (walkable && !checkInBlock(x, y)) patrollablePoints.push([x, y]);
        if (PLOT_MAP) str += "" + (walkable ? "x" : " ");
      }
      matrix.push(line);
      if (PLOT_MAP)
        str += `
      `;
    }
    grid = new PF.Grid(matrix);
    patrollableCache[mapName] = patrollablePoints;
    if (PLOT_MAP) fs.writeFileSync(`./${mapName}.txt`, str, "utf-8");
  }

  // console.timeEnd("matrix");

  if (!isInBlock && !walkableFrom) {
    debug(deviceId, ">>lib/path-finder::", "invalid walkable from:", from); //TRACE
    return;
  }
  if (isInBlock) {
    debug(deviceId, ">>lib/path-finder::", "inBLock ", from.x, from.y); //TRACE
  }

  let xx2, yy2;
  if (to === "PATROL") {
    let patrolPoint = playerDest[deviceId];
    // reset if none or already there
    if (!patrolPoint || getDistance({ x: xx, y: yy }, patrolPoint) < 4) {
      debug(deviceId, ">>lib/path-finder::", "generating patrol"); //TRACE
      //generate
      const randIndex = random(1, patrollableCache[mapName].length - 1);
      const patrolPointInd = patrollableCache[mapName][randIndex];
      patrolPoint = {
        x: patrolPointInd[0],
        y: patrolPointInd[1],
      };
      playerDest[deviceId] = patrolPoint;
    }
    xx2 = playerDest[deviceId].x;
    yy2 = playerDest[deviceId].y;
    debug(deviceId, ">>lib/path-finder::", "patroling to ", xx2, yy2); //TRACE
  } else {
    xx2 = to.x + mapConfig.offsetX;
    yy2 = to.y + mapConfig.offsetY;
  }

  const walkableTo = checkWalkable(xx2, yy2); //map[yy2 * mapConfig.width + xx2] < 1;

  if (!walkableTo) {
    debug(deviceId, ">>lib/path-finder::", "invalid walkable to:", xx2, yy2); //TRACE
    return;
  }

  const gridBackup = grid.clone();

  const finder = new PF.AStarFinder({
    allowDiagonal: true,
    dontCrossCorners: to === "PATROL",
  });

  // console.time("alg");
  debug(deviceId, ">>lib/path-finder::", "xx,yy,to.x,to.y", xx, yy, xx2, yy2); //TRACE
  const walkPaths = finder.findPath(xx, yy, xx2, yy2, grid);
  // debug(deviceId,">>lib/read-map::", "path length", walkPaths, walkPaths.length); //TRACE
  debug(deviceId, ">>lib/path-finder::", "walkPaths", walkPaths.length); //TRACE
  // console.timeEnd("alg");
  gridCache[mapName] = gridBackup;

  if (walkPaths.length < 1) {
    if (to === "PATROL") delete playerDest[deviceId];
    return;
  }

  const nextPaths =
    length && walkPaths.length > length
      ? walkPaths.splice(0, length)
      : walkPaths;

  // walkPaths.forEach((nextPoint) => {
  //   debug(deviceId,">>lib/path-finder::", "nextPoint", nextPoint); //TRACE
  // });
  const paths = [];
  nextPaths.forEach((nextPoint) => {
    const x = nextPoint[0] - mapConfig.offsetX;
    const y = nextPoint[1] - mapConfig.offsetY;
    // debug(deviceId,">>lib/path-finder::", "nextPoint", nextPoint); //TRACE 194 130
    if (!allowClickSelf && x === from.x && y == from.y) return;
    paths.push({
      x,
      y,
    });
  });
  debug(deviceId, ">>lib/path-finder::", "paths", last(nextPaths)); //TRACE
  debug(deviceId, ">>lib/path-finder::", "paths", last(paths)); //TRACE

  if (to !== "PATROL" && walkPaths.length > 35) {
    return { toFar: true };
  }
  return paths;
  // fs.writeFileSync("./test.txt", str);
};
