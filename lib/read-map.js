const fs = require("fs");
const path = require("path");
const PF = require("pathfinding");

const gridCache = {};

module.exports = function (mapName) {
  const map = fs.readFileSync(
    path.join(__dirname, "..", "maps", mapName + ".fld")
  );
  // x: 117,
  // y: 151,
  // width 320
  // height 400
  // FLDFile.data[y * FLDFile.width + x]
  console.log(">>lib/readMap::", "res", map.length); //TRACE

  const mapConfig = require(`../maps/${mapName}.json`);

  let cx = 55,
    cy = 187;
  const yy = cy + mapConfig.offsetY,
    xx = cx + mapConfig.offsetX;

  console.log(">>lib/read-map::", "pos", map[yy * mapConfig.width + xx]); //TRACE
  console.time("matrix");
  let grid = gridCache[mapName];
  if (!grid) {
    const matrix = [];
    for (let x = 0; x < mapConfig.width; x++) {
      const line = [];
      for (let y = 0; y < mapConfig.height; y++) {
        // str += "" + ;
        line.push(map[y * mapConfig.width + x] > 0 ? 1 : 0);
      }
      matrix.push(line);
    }

    grid = new PF.Grid(matrix);
  }
  console.timeEnd("matrix");

  const gridBackup = grid.clone();

  const finder = new PF.AStarFinder({
    allowDiagonal: true,
  });

  console.time("alg");
  const walkPath = finder.findPath(cx, cy, 57, 187, grid);
  console.log(">>lib/read-map::", "path", walkPath); //TRACE
  console.timeEnd("alg");
  gridCache[mapName] = gridBackup;

  // fs.writeFileSync("./test.txt", str);
};
