const jsonService = require("./json-service");

function debug(deviceId, ...args) {
  if (jsonService.get(deviceId, "debug"))
    console.log(`D[${deviceId}]:`, ...args);
}
module.exports = debug;
