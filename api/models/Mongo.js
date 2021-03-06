var mongo = require('mongoskin');
module.exports = {
  infoCollection: 'koop-info', 

  connect: function( conn ){
    this.client = mongo.db( conn, {safe:false} );
    return this; 
  },

  // get data out of the db
  select: function(key, options, callback){
    var self = this;
    //var layer = 0;
    var error = false,
      totalLayers,
      queryOpts = {}, 
      allLayers = [];

    // closure to check each layer and send back when done
    var collect = function(err, data){
      if (err) error = err;
      allLayers.push(data);
      if (allLayers.length == totalLayers){
        callback(error, allLayers);
      }
    };

    this._collection( this.infoCollection ).findOne({id: key+':info'}, function(err, infoDoc){
      if ( !infoDoc ){
        callback('Not Found', []);
      } else {
        totalLayers = infoDoc.info.length;
        infoDoc.info.forEach(function(layer, i){
          if ( options.geometry ){
            if ( typeof(options.geometry) == 'string' ){
              options.geometry = JSON.parse( options.geometry );
            }
            var box = options.geometry;
            queryOpts = {"geometry":{ $geoWithin:{ $geometry:{"type":"Polygon","coordinates":[[
              [box.xmin, box.ymin],
              [box.xmax, box.ymin],
              [box.xmax, box.ymax],
              [box.xmin, box.ymax],
              [box.xmin, box.ymin]
            ]]}}}};
          }
          self._collection( key+':'+i ).find( queryOpts ).toArray(function (err, docs) {
            //console.log('select docs', JSON.stringify(queryOpts));
            if (err) {
              console.log('Error selecting features in DB', err);
              // return all the data 
              self._collection( key+':'+i ).find().toArray(function (err, docs) {
                collect( null, {
                  type: 'FeatureCollection',
                  features: docs,
                  name: layer.name,
                  sha: layer.sha,
                  updated_at: layer.updated_at
                });
              });
            } else {
              if ( docs && docs.length ) {
                collect( null, {
                  type: 'FeatureCollection', 
                  features: docs, 
                  name: layer.name, 
                  sha: layer.sha, 
                  updated_at: layer.updated_at 
                });
              } else {
                collect( 'Not Found', null );
              }
            }
          });
        });
      }
    });
  },

  // create a collection and insert features
  // create a 2d index 
  insert: function( key, geojson, callback ){
    var self = this; 
    var info = [],
      count = 0;
      error = null;
    var check = function( err, success){
      if (err) error = err;
      count++;
      if (count == geojson.length){
        self._collection( 'koop-info' ).insert( { id: key + ':info', info: info }, function(){
          callback(error, true);
        });
      }
    };
    geojson.forEach(function( layer, i ){
      info[i] = { name: layer.name };
      info[i].updated_at = layer.updated_at;
      info[i].sha = layer.sha;

        self._collection( key+':'+i ).insert( layer.features, function(err, result){
          //self._collection( key+':'+i ).ensureIndex( { 'geometry' : "2dsphere" }, function(){
            check(err, true);
          //});
        });
    });

    
  },

  remove: function( key, callback){
    var self = this;
    var totalLayers, processedLayers = 0;
    var collect = function(){
      processedLayers++;
      if ( processedLayers == totalLayers ){
        self._collection( self.infoCollection ).remove({id: key+':info'}, function(err, success){
          callback( null, true );
        });
      }
    };
  
    this._collection( this.infoCollection ).findOne({id: key+':info'}, function(err, infoDoc){
      if ( !infoDoc || !infoDoc.info ){
        callback( null, true );
      } else {
        totalLayers = infoDoc.info.length;
        infoDoc.info.forEach(function(layer, i){
          self._collection( key+':'+i ).remove(function (err, docs) {
              collect();
          });
        });
      }
    });
  },

  services: { 
    register: function( type, info, callback){
      Mongo._collection( type ).insert( info,  function(err, result){
        callback( err, true );
      });
    },

    count: function( type, callback){
      Mongo._collection( type ).count( function(err, cnt){
        callback( err, cnt );
      });
    },

    remove: function( type, id, callback){
      Mongo._collection( type ).remove( { _id: id },  function(err, result){
        callback( err, true );
      });
    },

    get: function( type, id, callback){
      Mongo._collection( type ).find( ( (id) ? { _id: id } : {})).toArray(function (err, docs) {
        if (!docs.length) err = 'No service found by that id';
        callback( err, docs );
      });
    }
  },

  timer: {
    set: function(key, expires, callback){
      Mongo._collection( 'timers' ).ensureIndex( { "expireAt": 1 }, { expireAfterSeconds: 3600 } )
      Mongo._collection( 'timers' ).insert({key: key, expiresAt: new Date() });
      callback( null, true);
    },
    get: function(key, callback){
      Mongo._collection( 'timers' ).findOne({key: key}, function(err, timer){
        callback(err, timer);
      });
    }
  },


  //--------------
    // PRIVATE METHODS
  //-------------

  _collection: function(key){
    return this.client.collection( key );
  }

};
