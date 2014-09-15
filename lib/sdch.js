var assert = require('assert').ok;
var crypto = require('crypto');
var stream = require('stream');
var util = require('util');
var vcdiff = require('vcdiff');

exports.SdchEncoder = SdchEncoder;
exports.SdchDecoder = SdchDecoder;
exports.SdchDictionary = SdchDictionary;

exports.createSdchEncoder = function(dict, opts) {
  return new SdchEncoder(dict, opts);
};

exports.createSdchDecoder = function(dicts, opts) {
  return new SdchDecoder(dicts, opts);
};

exports.sdchEncode = function(buffer, dict, opts, callback) {
  if (opts instanceof Function) {
    callback = opts;
    opts = {};
  }
  return sdchBuffer(new SdchEncoder(dict, opts), buffer, callback);
};

exports.sdchEncodeSync = function(buffer, dict, opts) {
  return sdchBufferSync(new SdchEncoder(dict, opts), buffer);
};

exports.sdchDecode = function(buffer, dicts, opts, callback) {
  if (opts instanceof Function) {
    callback = opts;
    opts = {};
  }
  return sdchBuffer(new SdchDecoder(dicts, opts), buffer, callback);
};

exports.sdchDecodeSync = function(buffer, dicts, opts) {
  return sdchBufferSync(new SdchDecoder(dicts, opts), buffer);
};

exports.parseSdchDictionary = function(str) {
  var endHeaders = str.indexOf('\n\n');
  if (endHeaders === -1)
    throw new Error('SDCH dictionary headers not found');

  var headers = str.slice(0, endHeaders);
  headers = headers.split('\n').map(function(e) { return e.trim(); });
  var opts = {};
  var ports = [];
  headers.forEach(function(e) {
    var spl = e.split(':').map(function(e) { return e.trim(); });
    if (spl.length !== 2)
      throw new Error('Invalid header string: ' + e);
    var name = spl[0], value = spl[1];
    switch (name) {
      case 'domain':
        opts.domain = value;
        break;
      case 'path':
        opts.path = value;
        break;
      case 'format-version':
        opts.formatVersion = value;
        break;
      case 'max-age':
        opts.maxAge = Number(value);
        break;
      case 'port':
        ports.push(Number(value));
        break;
    };
  });
  if (ports.length !== 0)
    opts.ports = ports;
  opts.data = str.slice(endHeaders + 2);
  return new SdchDictionary(opts);
};

function sdchBuffer(engine, buffer, callback) {
  if (!(callback instanceof Function))
    throw new Error('callback should be a Function instance');
  var buffers = [];
  var nread = 0;

  engine.on('error', onError);
  engine.on('end', onEnd);

  engine.end(buffer);
  flow();

  function flow() {
    var chunk;
    while (null !== (chunk = engine.read())) {
      buffers.push(chunk);
      nread += chunk.length;
    }
    engine.once('readable', flow);
  }

  function onError(err) {
    engine.removeListener('end', onEnd);
    engine.removeListener('readable', flow);
    callback(err);
  }

  function onEnd() {
    var buf = Buffer.concat(buffers, nread);
    buffers = [];
    callback(null, buf);
    engine.close();
  }
};

function sdchBufferSync(engine, buffer) {
  if (typeof buffer === 'string')
    buffer = new Buffer(buffer);
  if (!Buffer.isBuffer(buffer))
    throw new TypeError('Not a string or buffer');
  return engine._sync(buffer);
};

if (!Array.prototype.find) {
  Array.prototype.find = function(predicate) {
    if (this == null) {
      throw new TypeError('Array.prototype.find called on null or undefined');
    }
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    var list = Object(this);
    var length = list.length >>> 0;
    var thisArg = arguments[1];
    var value;

    for (var i = 0; i < length; i++) {
      value = list[i];
      if (predicate.call(thisArg, value, i, list)) {
        return value;
      }
    }
    return undefined;
  };
};

var DecodeState = {
  RECEIVING_HASH: 1,
  STREAMING: 2,
};

var SERVER_HASH_SIZE = 9;

function SdchDictionary(opts) {
  if (!opts.domain || (typeof opts.domain !== 'string'))
    throw new Error('domain must be string');
  this.domain = opts.domain;

  if (!opts.data)
    throw new Error('cannot create dictionary without data');

  if (typeof opts.data === 'string') {
    this.data = new Buffer(opts.data);
  } else if (Buffer.isBuffer(opts.data)) {
    this.data = opts.data;
  } else {
    throw new Error('data must be Buffer or string');
  }

  this.hashedDict = new vcdiff.HashedDictionary(this.data);

  if (opts.path) {
    if (typeof opts.path !== 'string')
      throw new Error('path must be string');
    this.path = opts.path;
  }

  if (opts.formatVersion) {
    if (typeof opts.formatVersion !== 'string')
      throw new Error('formatVersion must be string');
    this.formatVersion = opts.formatVersion;
  }

  if (opts.maxAge) {
    if (opts.maxAge !== parseInt(opts.maxAge))
      throw new Error('maxAge must be integer');
    this.maxAge = opts.maxAge;
  }

  if (opts.ports) {
    if (opts.ports instanceof Array)
      throw new Error('ports must be array of integers');
    opts.ports.forEach(function (e) {
      if (e !== parseInt(e))
        throw new Error('ports must be array of integers');
    });
    this.ports = opts.ports;
  }

  if (opts.url) {
    if (typeof opts.url !== 'string')
      throw new Error('url must be string');
    this.url = opts.url;
  }

  this._headersBuffer = this._constructHeaders();

  var shasum = crypto.createHash('sha256');
  shasum.update(this._headersBuffer);
  shasum.update(this.data);
  var hash = shasum.digest();
  this.etag = urlSafe(hash.slice(0, 16).toString('base64'))

  function urlSafe(str) {
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  this.clientHash = urlSafe(hash.slice(0, 6).toString('base64'));
  this.serverHash = urlSafe(hash.slice(6, 12).toString('base64'));
};

SdchDictionary.prototype._constructHeaders = function() {
  var headers = [];
  function createHeaderString(name, value) {
    return name + ': ' + value + '\n';
  }
  headers.push(createHeaderString('domain', this.domain));
  if (this.path)
    headers.push(createHeaderString('path', this.path));
  if (this.formatVersion)
    headers.push(createHeaderString('format-version', this.formatVersion));
  if (this.maxAge)
    headers.push(createHeaderString('max-age', this.maxAge));
  if (this.ports)
    ports.forEach(function(e) {
      headers.push(createHeaderString('port', e));
    });
  return new Buffer(headers.join('') + '\n');
};

SdchDictionary.prototype.getOutputStream = function(opts) {
  return new DictStream(this, opts);
};

SdchDictionary.prototype.getLength = function() {
  return this._headersBuffer.length + this.data.length;
};

// Declare public fields in advance.
SdchDictionary.prototype.data = undefined;
SdchDictionary.prototype.hashedDict = undefined;
SdchDictionary.prototype.domain = undefined;
SdchDictionary.prototype.path = undefined;
SdchDictionary.prototype.formatVersion = undefined;
SdchDictionary.prototype.maxAge = undefined;
SdchDictionary.prototype.ports = undefined;
SdchDictionary.prototype.clientHash = undefined;
SdchDictionary.prototype.serverHash = undefined;
SdchDictionary.prototype.etag = undefined;
SdchDictionary.prototype.url = undefined;

function DictStream(dictionary, opts) {
  opts = opts || {};
  this._sent = false;
  this._dictionary = dictionary;
  if (opts.range)
    this._range = opts.range;
  stream.Readable.call(this, opts);
};
util.inherits(DictStream, stream.Readable);

DictStream.prototype._read = function() {
  if (this._range) {
    if (!this._sent) {
      if (this._range.start >= this._dictionary._headersBuffer.length) {
        var start = this._range.start - this._dictionary._headersBuffer.length;
        var end = this._range.end - this._dictionary._headersBuffer.length;
        this.push(this._dictionary.data.slice(start, end));
        this._sent = true;
      } else if (this._range.end < this._dictionary._headersBuffer.length) {
        this._sent = true;
        this.push(this._dictionary._headersBuffer.slice(
            this._range.start, this._range.end));
      } else {
        this.push(this._dictionary._headersBuffer.slice(this._range.start));
        var sent = this._dictionary._headersBuffer.length - this._range.start;
        this.push(this._dictionary.data.slice(0, this._range.end - sent));
        this._sent = true;
      }
    } else {
      this.push(null);
    }
  } else {
    if (!this._sent) {
      this.push(this._dictionary._headersBuffer);
      this.push(this._dictionary.data);
      this._sent = true;
    } else {
      this.push(null);
    }
  }
};

function SdchEncoder(dict, opts) {
  opts = opts || {};
  opts.hashedDictionary = dict.hashedDict;

  this._dictionary = dict;

  stream.Transform.call(this, opts);

  this._vcdiff = vcdiff.createVcdiffEncoder(opts);
  this._prologueSent = false;
  this._serverHashBuf = new Buffer(this._dictionary.serverHash + '\0');
};
util.inherits(SdchEncoder, stream.Transform);

SdchEncoder.prototype.close = function(callback) {
  this._vcdiff.close(callback);
};

SdchDecoder.prototype.flush = function(callback) {
  this._vcdiff.flush(callback);
};

SdchEncoder.prototype._flush = function(callback) {
  this._vcdiff._flush(callback);
};

SdchEncoder.prototype._transform = function(chunk, encoding, cb) {
  if (chunk !== null && !Buffer.isBuffer(chunk))
    return cb(new Error('invalid input'));

  if (!this._prologueSent) {
    this.push(this._serverHashBuf);
    this._prologueSent = true;
  }

  vcdiffShim(this, chunk, encoding, cb);
};

SdchEncoder.prototype._sync = function(buffer) {
  var encoded = this._vcdiff._processChunk(buffer, true);
  var totalLength = this._serverHashBuf.length + encoded.length;
  return Buffer.concat([ this._serverHashBuf, encoded ], totalLength);
};

function SdchDecoder(dicts, opts) {
  this._opts = opts || {}
  this._dictionaries = dicts;

  stream.Transform.call(this, opts);

  this._decodeState = DecodeState.RECEIVING_HASH;
  this._hashChunks = [];
  this._nreadHash = 0;
};
util.inherits(SdchDecoder, stream.Transform);

SdchDecoder.prototype.close = function(callback) {
  if (this._vcdiff)
    this._vcdiff.close(callback);
};

SdchDecoder.prototype.flush = function(callback) {
  if (this._vcdiff) {
    this._vcdiff.flush(callback);
  } else {
    callback();
  }
};

SdchDecoder.prototype._flush = function(callback) {
  if (this._vcdiff) {
    this._vcdiff._flush(callback);
  } else {
    callback();
  }
};

SdchDecoder.prototype._transform = function(chunk, encoding, cb) {
  if (chunk !== null && !Buffer.isBuffer(chunk))
    return cb(new Error('invalid input'));

  if (this._decodeState === DecodeState.RECEIVING_HASH) {
    var rest = SERVER_HASH_SIZE - this._nreadHash;
    assert(rest > 0, 'Some illegal stuff happening');
    if (chunk.length >= rest) {
      var restBuf = chunk.slice(0, 0 + rest);
      this._nreadHash += rest;
      this._hashChunks.push(restBuf);
      var serverHash = Buffer.concat(this._hashChunks, this._nreadHash).toString();
      if (serverHash[SERVER_HASH_SIZE - 1] !== '\0') {
        this.close();
        cb(new Error('Invalid server hash'));
        return;
      }

      serverHash = serverHash.slice(0, serverHash.length - 1).toString();
      var dict = this._dictionaries.find(function(e, i, arr) {
        return e.serverHash === serverHash;
      });

      if (!dict) {
        this.close();
        cb(new Error('Unknown dictionary'));
        return;
      }

      this._opts.dictionary = dict.data;
      this._vcdiff = vcdiff.createVcdiffDecoder(this._opts);
      this._decodeState = DecodeState.STREAMING;
      chunk = chunk.slice(rest);
    } else {
      this._nreadHash += chunk.length;
      this._hashChunks.push(chunk);
    }
  }

  if (this._decodeState === DecodeState.STREAMING) {
    vcdiffShim(this, chunk, encoding, cb);
  } else {
    cb();
  }
};

SdchDecoder.prototype._sync = function(buffer) {
  if (buffer.length < SERVER_HASH_SIZE)
    throw new Error('data should at least contain dictionary server hash');
  var serverHash = buffer.slice(0, SERVER_HASH_SIZE);
  if (serverHash.toString()[SERVER_HASH_SIZE - 1] !== '\0') {
    throw new Error('Invalid server hash');
  }

  serverHash = serverHash.slice(0, serverHash.length - 1).toString();
  var dict = this._dictionaries.find(function(e, i, arr) {
    return e.serverHash === serverHash;
  });

  if (!dict)
    throw new Error('Unknown dictionary' + serverHash.toString());

  this._opts.dictionary = dict.data;
  this._vcdiff = vcdiff.createVcdiffDecoder(this._opts);
  buffer = buffer.slice(SERVER_HASH_SIZE);

  return this._vcdiff._processChunk(buffer, true);
};

function vcdiffShim(sdchStream, chunk, encoding, cb) {
  sdchStream._vcdiff.once('error', onError);
  sdchStream._vcdiff.once('end', onEnd);
  sdchStream._vcdiff.once('readable', flow);
  sdchStream._vcdiff._transform(chunk, encoding, callback);

  function flow() {
    while (null !== (chunk = sdchStream._vcdiff.read())) {
      sdchStream.push(chunk);
    }
  }

  function onError(err) {
    sdchStream._vcdiff.removeListener('end', onEnd);
    sdchStream._vcdiff.removeListener('readable', flow);
    sdchStream.error(err);
  }

  function onEnd() {
    sdchStream.end();
  }

  function callback() {
    cb();
  }
};
