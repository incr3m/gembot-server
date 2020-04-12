const fs = require("fs");
const path = require("path");
const PF = require("pathfinding");
const last = require("lodash/last");
const random = require("lodash/random");

const gridCache = {};
const walkableCache = {};
const playerDest = {};

const DEFAULT_PLAYER_NAME = "pc";

module.exports = function ({
  mapName,
  from,
  to,
  length = 10,
  allowClickSelf = false,
}) {
  // x: 117,
  // y: 151,
  // width 320
  // height 400
  // FLDFile.data[y * FLDFile.width + x]
  // console.log(">>lib/readMap::", "res", map.length); //TRACE
  console.log(">>lib/path-finder::", "from,to", from.x, from.y, to); //TRACE
  const mapConfig = require(`../maps/${mapName}.json`);

  const map = fs.readFileSync(
    path.join(__dirname, "..", "maps", mapName + ".fld")
  );

  console.time("matrix");
  let grid = gridCache[mapName];
  if (!grid) {
    const matrix = [];
    const walkablePaths = [];
    // let str = "";
    for (let y = 0; y < mapConfig.height; y++) {
      const line = [];
      for (let x = 0; x < mapConfig.width; x++) {
        const walkable = map[y * mapConfig.width + x] < 1;
        line.push(walkable ? 0 : 1);
        if (walkable) walkablePaths.push([x, y]);
        // str += "" + (walkable ? "x" : " ");
      }
      matrix.push(line);
      //       str += `
      // `;
    }
    grid = new PF.Grid(matrix);
    walkableCache[mapName] = walkablePaths;
    // fs.writeFileSync("./test.txt", str, "utf-8");
  }

  console.timeEnd("matrix");

  let cx = from.x,
    cy = from.y;
  const xx = cx + mapConfig.offsetX,
    yy = cy + mapConfig.offsetY;
  let xx2, yy2;
  if (to === "PATROL") {
    let patrolPoint = playerDest[DEFAULT_PLAYER_NAME];
    // reset if none or already there
    if (!patrolPoint || (xx === patrolPoint.x && yy === patrolPoint.y)) {
      console.log(">>lib/path-finder::", "generating patrol"); //TRACE
      //generate
      const randIndex = random(1, walkableCache[mapName].length - 1);
      const patrolPointInd = walkableCache[mapName][randIndex];
      patrolPoint = {
        x: patrolPointInd[0],
        y: patrolPointInd[1],
      };
      playerDest[DEFAULT_PLAYER_NAME] = patrolPoint;
    }
    xx2 = playerDest[DEFAULT_PLAYER_NAME].x;
    yy2 = playerDest[DEFAULT_PLAYER_NAME].y;
    console.log(">>lib/path-finder::", "patroling to ", xx2, yy2); //TRACE
  } else {
    xx2 = to.x + mapConfig.offsetX;
    yy2 = to.y + mapConfig.offsetY;
  }

  const walkableFrom = map[yy * mapConfig.width + xx] < 1;
  const walkableTo = map[yy2 * mapConfig.width + xx2] < 1;

  if (!walkableFrom) {
    console.log(">>lib/path-finder::", "invalid walkable from:", from); //TRACE
    return;
  }
  if (!walkableTo) {
    console.log(">>lib/path-finder::", "invalid walkable to:", xx2, yy2); //TRACE
    return;
  }

  const gridBackup = grid.clone();

  const finder = new PF.AStarFinder({
    allowDiagonal: true,
  });

  console.time("alg");
  console.log(">>lib/path-finder::", "xx,yy,to.x,to.y", xx, yy, xx2, yy2); //TRACE
  const walkPaths = finder.findPath(xx, yy, xx2, yy2, grid);
  // console.log(">>lib/read-map::", "path length", walkPaths, walkPaths.length); //TRACE
  console.log(">>lib/path-finder::", "walkPaths", walkPaths.length); //TRACE
  console.timeEnd("alg");
  gridCache[mapName] = gridBackup;

  if (walkPaths.length < 1) return;

  const nextPaths =
    length && walkPaths.length > length
      ? walkPaths.splice(0, length)
      : walkPaths;

  // walkPaths.forEach((nextPoint) => {
  //   console.log(">>lib/path-finder::", "nextPoint", nextPoint); //TRACE
  // });
  const paths = [];
  nextPaths.forEach((nextPoint) => {
    const x = nextPoint[0] - mapConfig.offsetX;
    const y = nextPoint[1] - mapConfig.offsetY;
    // console.log(">>lib/path-finder::", "nextPoint", nextPoint); //TRACE 194 130
    if (!allowClickSelf && x === from.x && y == from.y) return;
    paths.push({
      x,
      y,
    });
  });
  console.log(">>lib/path-finder::", "paths", last(nextPaths)); //TRACE
  console.log(">>lib/path-finder::", "paths", last(paths)); //TRACE
  if (to !== "PATROL" && walkPaths.length > 25) {
    return { toFar: true };
  }
  return paths;
  // fs.writeFileSync("./test.txt", str);
};

// if (!grid) {
//   const walkablePaths = [];
//   grid = new PF.Grid(mapConfig.width, mapConfig.height);

//   for (let y = 0; y < mapConfig.height; y++) {
//     // const line = [];
//     for (let x = 0; x < mapConfig.width; x++) {
//       // str += "" + ;
//       // line.push( ? 1 : 0);
//       const walkable = map[y * mapConfig.width + x] < 1;
//       if (walkable) walkablePaths.push([x, y]);
//       grid.setWalkableAt(x, y, walkable);
//     }
//     // matrix.push(line);
//   }
//   // grid = new PF.Grid(matrix);
//   walkableCache[mapName] = walkablePaths;
// }
