# node-sdch

[![Build Status](https://travis-ci.org/baranov1ch/node-sdch.svg?branch=master)](https://travis-ci.org/baranov1ch/node-sdch)

SDCH encoder/decoder for node.js

## Quick overview.

Based on [node-vcdiff](http://github.com/baranov1ch/node-vcdiff). In a nutshell,
SDCH adds HTTP layer to VCDIFF compression:

```javascript
var sdch = require('sdch');

var dict = new sdch.SdchDictionary({
  domain: 'kotiki.cc',
  path: '/',
  data: 'Yo dawg I heard you like common substrings in your documents so we ' +
  'put them in your vcdiff dictionary so you can compress while you compress'
});

var testData =
  'Yo dawg I heard you like common substrings somewhere else so we put ' +
  'them in your vcdiff dictionary so you can decompress while you decompress'

var encoded = sdch.sdchEncodeSync(testData, dict);
var decoded = sdch.sdchDecodeSync(encoded, [ dict ]);

sdch.sdchEncode(testData, dict, function(err, enc) {
  sdch.sdchDecode(enc, [ dict ], function(err, dec) {
    assert(testData === dec.toString());
  });
});

var in = createInputStreamSomehow();
var out = createOutputStreamSomehow();
var encoder = sdch.createSdchEncoder(dict);
in.pipe(encoder).pipe(out);

var decoder = sdch.createSdchDecoder([dict]);
out.pipe(decoder).pipe(process.stdout);
```

You may want to use [connect-sdch](http://github.com/baranov1ch/connect-sdch) which provides all basic server-side stuff required to serve
sdch-encoded content. 

## Slow overview

HTTP Server may provide a
dictionary to the client, and the client may use it to decode server responses.
Dictionary in SDCH has to be associated with some domain, optionally path and
ports, and have some properties. These properties are prepended to a VCDIFF
dictionary in HTTP-header format:

```
domain: kotiki.cc
path: /
port: 80
port: 3000
max-age: 86400

```

When the client requests the server, it appends _client hashes_ of available
dictionaries (which the client may have downloaded later). The server chooses
the dictionary to decode with and proceeds. This is why `SdchDecoder` accepts
the list of dictionaries instead of a single one. Decoder do not know which
particular dictionary server whould choose, it will figure it out only when
parsing the response.

SDCH-encoded entity differs from VCDIFF encoded by dictionary _server hash_
appended in a front of vcdiff-encoded body. So SDCH encoder just prepends
this hash + `'\0'` and then streams VCDIFF-encoded data. The decoder parses
this hash and selects the dictionary from provided and decodes the data.

> Well-behaved SDCH client should check a lot of security stuff about the
> dictionaries proposed by the server, particularly scheme, domain, port,
> and path match. This package includes util functions to make all these
> checks (`sdch.clientUtils`). See how [connect-sdch](http://github.com/baranov1ch/connect-sdch) example client
> uses them to validate server provided dictionaries and to choose what
> to advertise. You may also refer to chromium code for more information.

Here is a quick example of how server and client hashes are created:

```javascript
var shasum = crypto.createHash('sha256');
shasum.update(...);
var hash = shasum.digest();

var clientHash = urlsafeEncode(hash.slice(0, 6).toString('base64'));
var serverHash = urlsafeEncode(hash.slice(6, 12).toString('base64'));
```
