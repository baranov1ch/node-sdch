sdch = require '../sdch'
chai = require 'chai'
stream = require 'stream'

chai.should()

describe 'sdch', ->
  it 'should have all expected exports', ->
    sdch.should.respondTo 'SdchEncoder'
    sdch.should.respondTo 'SdchDecoder'
    sdch.should.respondTo 'SdchDictionary'
    sdch.should.respondTo 'createSdchEncoder'
    sdch.should.respondTo 'createSdchDecoder'
    sdch.should.respondTo 'sdchEncode'
    sdch.should.respondTo 'sdchEncodeSync'
    sdch.should.respondTo 'sdchDecode'
    sdch.should.respondTo 'sdchDecodeSync'

  describe 'there and back again', ->
    dict = new sdch.SdchDictionary
      domain: 'kotiki.cc'
      data: new Buffer 'testmehatekillomgdieyoulittledumb'
    testData = 'testmehatekillomgdieyoulittledumbdieyoulittledumb'

    it 'should encode and decode sync', ->
      e = sdch.sdchEncodeSync testData, dict
      e = sdch.sdchDecodeSync e, [dict]
      e.toString().should.equal testData

    it 'should encode and decode async', (done) ->
      sdch.sdchEncode testData, dict, (err, enc) ->
        sdch.sdchDecode enc, [dict], (err, dec) ->
          dec.toString().should.equal testData
          done()

    it 'should work with stream api', (done) ->
      encoder = sdch.createSdchEncoder dict
      decoder = sdch.createSdchDecoder [dict]

      class ReadingStuff extends stream.Readable
        constructor: (@data) ->
          super()

        _read: () ->
          @push @data
          @data = null

      class WritingStuff extends stream.Writable
        constructor: (finishcb) ->
          super()
          @nread = 0
          @data_ = []
          @on 'finish', ->
            finishcb(Buffer.concat(@data_, @nread))

        _write: (chunk, encoding, next) ->
          chunk.should.be.instanceof Buffer
          @nread += chunk.length
          @data_.push(chunk)
          next()

      testIn = new ReadingStuff testData
      testOut = new WritingStuff (result) ->
        result.should.have.length.below testData.length
        encodedIn = new ReadingStuff(result)
        decodedOut = new WritingStuff (result) ->
          result.toString().should.equal testData
          done()
        encodedIn.pipe(decoder).pipe(decodedOut)
      testIn.pipe(encoder).pipe(testOut)
