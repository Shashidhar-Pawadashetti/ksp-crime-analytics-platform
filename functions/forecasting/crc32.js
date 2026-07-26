'use strict';
function crc32(str) {
  var hash = 0xFFFFFFFF;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    hash ^= c;
    for (var j = 0; j < 8; j++) {
      if (hash & 1) hash = (hash >>> 1) ^ 0xEDB88320;
      else hash = hash >>> 1;
    }
  }
  return (~hash >>> 0);
}
module.exports = crc32;
