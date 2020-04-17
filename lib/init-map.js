const request = require("request"),
  zlib = require("zlib"),
  path = require("path"),
  fs = require("fs");

module.exports = function initMap(name = "iz_dun01") {
  // function initMap(name = "iz_dun02") {
  return new Promise((resolve, reject) => {
    const fileName = path.join(__dirname, "..", "maps", `${name}.fld`);
    if (fs.existsSync(fileName)) {
      resolve();
      return;
    }
    const out = fs.createWriteStream(fileName);

    out.on("finish", function () {
      console.log("Downloading map done.", name);
      resolve();
    });

    out.on("error", function (err) {
      console.log(err);
      reject(err);
    });

    console.log("Downloading map start.", name);
    request(
      `https://github.com/OpenKore/openkore/raw/master/fields/${name}.fld.gz`
    )
      .pipe(zlib.createGunzip())
      .pipe(out);
  });
};

// initMap();
