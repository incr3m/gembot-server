const fs = require("fs");
const path = require("path");
const _ = require("lodash");

// 38bf9feada257016 - emu
// 38bf9feada257016 - cp2
// 8006baab5f937fd8 - redmi

const DEVICE_MAPPING = {
  "3cd433865e1efc90": {
    debug: false,
    disabled: false,
    hunt: ["muka","dragon", "cho"],
    evade: ["hunter"],
    itemExclude: [],
    TRAVEL: "",
  }, // redmi go,
  // "38bf9feada257016": {
  //   debug: false,
  //   disabled: false,
  //   map: "gef_fild04",
  //   hunt: ["pupa", "poring", "creamy"],
  //   itemExclude: ["나비날개분", "젤로피"],
  // }, // android sym,
  "38bf9feada257016": {
    disabled: false,
    // debug: true,
    // map: "iz_dun01",
    hunt: ["*"],
    evade: [],
    itemExclude: ["썩은비늘", "개구리알", "촉수", "고기", "스켈본", "이는물갈"],
    // pickUpTap: true,
    allowAlerts: true,
    FORCE_CLICK: "",
    TRAVEL: "",
  }, // android sym,
};

const bakPath = path.join(__dirname, "..", "data", "DEFAULT_MAPPING.json");

fs.writeFileSync(bakPath, JSON.stringify(DEVICE_MAPPING, null, 4));

function ids(fields = []) {
  const res = {};
  Object.keys(DEVICE_MAPPING).forEach((key) => {
    const obj = {};
    fields.forEach((field) => {
      _.set(obj, field, get(key, field));
    });
    res[key] = obj;
  });
  return res;
}

function reset(deviceId) {
  const bakJson = JSON.parse(fs.readFileSync(bakPath));
  DEVICE_MAPPING[deviceId] = bakJson[deviceId];
}

function save(deviceId, json) {
  DEVICE_MAPPING[deviceId] = { ...(DEVICE_MAPPING[deviceId] || {}), ...json };
}

function set(deviceId, path, value, log) {
  if (log) console.log(">>lib/json-service::", "set", deviceId, path, value); //TRACE
  _.set(DEVICE_MAPPING[deviceId], path, value);
}

function get(deviceId, path, defaultVal) {
  if (!path) return DEVICE_MAPPING[deviceId];
  return _.get(DEVICE_MAPPING[deviceId], path, defaultVal);
}

module.exports = { save, set, get, ids, reset };
