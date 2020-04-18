const path = require("path");
function getPoint(travelKey, from, to) {
  const travelData = require(path.join(
    __dirname,
    "..",
    "travel",
    travelKey + ".json"
  ));
  console.log(">>lib/travel-helper::", "travelData", travelData); //TRACE
  let point;
  travelData.points.some((p) => {
    if (p.startsWith(from + " ")) {
      point = p;
      return true;
    }
  });
  console.log(">>lib/travel-helper::", "point", point); //TRACE
  if (!point) return;
  const sIdx = point.indexOf(" (");
  const eIdx = point.indexOf(")");
  const [xRaw, yRaw] = point.substring(sIdx + 2, eIdx).split(", ");
  return {
    x: Number(xRaw),
    y: Number(yRaw),
  };
}

module.exports = {
  getPoint,
};

// console.log(getPoint("morroc_sphinx", "morocc"));
