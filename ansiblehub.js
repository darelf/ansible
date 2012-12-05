var crypto = require('crypto'),
     redis = require('redis');

/* Find the correct environment */
var fs = require('fs');
var envfloc = JSON.parse(fs.readFileSync('envloc.json', 'utf-8'));
var env = JSON.parse(fs.readFileSync(envfloc['ENV_FILE_LOCATION'], 'utf-8'));

var client = redis.createClient(env['DOTCLOUD_DATA_REDIS_PORT'],
                                env['DOTCLOUD_DATA_REDIS_HOST']);

/* Let's authenticate with redis (if needed)*/
if (env['DOTCLOUD_DATA_REDIS_PASSWORD'] != '')
  client.auth(env['DOTCLOUD_DATA_REDIS_PASSWORD']);


/* New user token system, 24 byte base64 random data */
function getNewToken() {
  return crypto.randomBytes(24).toString('base64');
}


var storage = {
  ansible: '',
  setGM: function( group, uname, callback ) {
    client.set( "groups:gm:" + group, uname, callback );
  },

  getGM: function( group, callback ) {
    client.get( "groups:gm:" + group, callback );
  },
  
  setCurrentInitiative: function( group, uname, callback ) {
    client.set( "groups:curinit:" + group, uname, callback);
  },
  
  getCurrentInitiative: function( group, callback ) {
    client.get( "groups:curinit:" + group, callback );
  },
  
  changeInitiative: function( uname, initiative, callback ) {
    console.log("setting key data:" + uname);
    client.hmset( "data:" + uname, {name: uname, init: initiative}, callback);
  },
  
  updateUserData: function( data, callback ) {
    client.hmset( "data:" + data.name, {name: data.name, init: data.init, condition: data.condition}, callback );
  },
  
  getUserData: function( name, callback ) {
    client.hgetall( "data:" + name, callback );
  },
/* Basic functions */

  addUser: function( group, name, callback ) {
    client.sadd( "groups:" + group, name, callback );
    client.sadd( "groups", group );
  },

  removeUser: function( group, name, callback ) {
    client.get( "groups:gm:" + group, function(err,rep) {
      if ( rep == name )
        client.del( "groups:gm:" + group );
    });
    client.del( "users:" + name );
    client.del( "data:" + name );
    client.srem( "groups:" + group, name, callback );
    client.exists( "groups:" + group, function(err, rep) {
      if (rep == 0) {
        client.srem( "groups", group );
        client.del( "groups:curinit:" + group );
      }
    });
  },

  removeUserFromAllGroups: function( name ) {
    var self = this;
    self.getGroupList(function(err,rep) {
      for(var i = 0; i < rep.length; i++) {
        var group = rep[i];
        self.removeUser(group, name, function(err,rep) {
          self.listUsers(group, function(err,rep) { hub.sendToGroup('userlist', rep); });
          self.sendUserDataList(group);
        });
      }
    });
  },

  sendUserDataList: function( group ) {
    var self = this;
    hub.sendToGroup(group, 'clearuserlist');
    self.listUsers( group, function(err, rep) {
      rep.forEach(function(val, i) {
        self.getUserData( val, function(err2, rep2) {
          hub.sendToGroup(group, 'updateinit', rep2);
        });
      });
    });
  },

  listUsers: function( group, callback ) {
    client.smembers( "groups:" + group, callback );
  },

  getGroupList: function( callback ) {
    client.smembers( "groups", callback );
  },
  
  readMessage: function( id, callback ) {
    client.hgetall("post:" + id, callback);
  },
  
  messageList: function( group, max, callback ) {
    client.lrange("inbox:group:" + group, 0, max, callback );
  },
  
  sendGroupMessage: function( group, uname, message, callback ) {
    client.incr("post:nextMessageID", function(err,rep) {
      var id = rep;
      client.multi()
        .hmset("post:" + id, {fromuser: uname, type: "chat", text: message})
        .lpush("inbox:group:" + group, id)
        .ltrim("inbox:group:" + group, 0, 100)
        .lpush("outbox:user:" + uname, id)
        .ltrim("outbox:user:" + uname, 0, 30)
        .lpush("global:messages", id)
        .exec(function(err,rep) {
          callback(id);
          client.llen("global:messages", function(e,r) {
            if (r > 120) {
              client.rpop("global:messages", function(error, reply) {
                client.del("post:" + reply);
              });
            }
          });
      });
    });
  },

  /* We need to check if the token already exists */
  registerNewUserToken: function(user, callback) {
    var self = this;
    var token = getNewToken();
    client.exists(token, function(err,rep) {
      if ( rep == 0 ) {
        console.log("setting token for " + user + " to " + token);
        client.setex(token, 1800, user);
        client.setex( "users:" + user, 1800, token );
        callback(token);
      } else {
        self.registerNewUserToken(user, callback);
      }
    });
  },
  
  /* Validate parking... I mean, user token */
  checkUserToken: function(user, token, callback) {
    client.get(token, function(err, rep) {
      callback( (rep == user) );
    });
  },

  notifyGMStatus: function(group, socket) {
    var self = this;
    self.getGM( group, function(err,rep) {
      if (rep)
        socket.emit('newgm', rep);
      else
        socket.emit('newgm', '');
        
      self.sendUserDataList(group);
    });
  },

  /* We are moving a user from one group to another
     and notifying everyone of what happened */
  moveUserGroup: function(socket, data, callback) {
    var self = this;
    //Let's leave all the other rooms before joining a new one
    var myrooms = ansbile.getRooms(socket.id);
    for(var k in myrooms) {
      if ( k != '' ) {
        var room = k.substr(1);
        socket.leave(room);
        console.log("removing user " + data.name + " from " + room);
        self.removeUser( room, data.name, function(err, rep) {
          //Tell the old group about the updated userlist
          listUsers( room, function(err, rep) {
            ansible.sendToGroup( room, 'userlist', rep );
          });
        });
      }
    }
    //join the new room
    socket.join(data.group);
    self.addUser(data.group, data.name, function(err,rep) {
      callback(err, rep);
      //Update the new group with the new user list
      self.listUsers(data.group, function(err,rep) {
        ansible.sendToGroup(data.group, 'userlist', rep);
      });
      //Let everyone know about the new room list
      self.getGroupList(function(err, rep) {
        ansible.sendToEveryone('grouplist', rep);
      });
      //Let this guy know if there is already a GM for that group
      self.notifyGMStatus( data.group, socket );
    });
    socket.on('disconnect', function() {
      console.log("Received Disconnect");
      //Expire token.. this leave the opposite, but that can be
      //considered a feature in this case.
      client.del(data.name);
  
      self.removeUser(data.group, data.name, function(err,rep) {
        self.listUsers(data.group, function(err,rep) { ansible.sendToGroup(data.group, 'userlist', rep); });  
        self.sendUserDataList(data.group);
      });
    });
  },

  registerNewUser: function(socket, data, callback) {
    var self = this;
    client.exists( data.name, function(err,rep) {
      if (rep == 0) {
        self.registerNewUserToken(data.name, function(token) {
          socket.emit('newtoken', token);
        });
        
        socket.join(data.group);
        self.addUser(data.group, data.name, function(err,rep) {
          callback(rep);
          //Update the new group with the new user list
          self.listUsers(data.group, function(err,rep) {
            self.ansible.sendToGroup(data.group, 'userlist', rep);
          });
          //Let everyone know about the new room list
          self.getGroupList(function(err, rep) {
            self.ansible.sendToEveryone('grouplist', rep);
          });
          //Let this guy know if there is already a GM for that group
          self.notifyGMStatus( data.group, socket );
        });
        
        socket.on('disconnect', function() {
          console.log("Received Disconnect");
          //Expire token.. this leave the opposite, but that can be
          //considered a feature in this case.
          client.del(data.name);
          self.removeUser(data.group, data.name, function(err,rep) {
            self.listUsers(data.group, function(err,rep) { self.ansible.sendToGroup(data.group, 'userlist', rep); });      
            self.sendUserDataList(data.group);
          });
        });
      } else {
        //Let the user know this name is already taken
        callback(0);
      }
    });
  }
}

/* What to do when a new connection comes in */
var hub = {
  io: '',
  storage: '',
  startup: function() {
    var self = this;
    this.io.sockets.on('connection', function(socket) {
      console.log("Client connected using " + self.io.transports[socket.id].name);
      /* Register action. */
      socket.on('register', function(data) {
        if (data.token) {
          console.log("user has a token: " + data.token);
          self.storage.checkUserToken(data.name, data.token, function(itworked) {
            console.log(itworked);
            if (itworked) {
              console.log("user token checked out");
              self.storage.moveUserGroup(socket, data, function(err,rep) {
                socket.emit('ack', 1);
              });
            }
          });
        } else {
          console.log("user does not have a token");
          self.storage.registerNewUser(socket, data, function(itworked) {
            socket.emit('ack', itworked);
            if (itworked) {
              self.storage.changeInitiative(data.name, '0', function(err, rep) {
                if (err) console.log(err);  
              });
            }
          });
        }
      });
      /* They want a list of users */
      socket.on('users', function(data) {
        self.storage.listUsers(data.group, function(err,rep) { socket.emit('userlist', rep); } );
      });
      /* They want to read a single post by id */
      socket.on('read', function(data) {
        self.storage.readMessage( data.id, function(err, rep) { socket.emit('message', rep); });
      });
      /* They want to send a chat post to a certain group */
      socket.on('grpmsg', function(data) {
        self.storage.sendGroupMessage( data.group, data.name, data.text, function(x) {
          self.io.sockets.in(data.group).emit('newmessage', x);
        });
      });
      /* They want to know what groups are currently active on this server */
      socket.on('grouplisting', function() {
        self.storage.getGroupList(function(err, rep) { socket.emit('grouplist', rep); });
      });
      /* They want a list of the most recent post ids for a group */
      socket.on('getmessagelist', function(data) {
        self.storage.messageList( data.group, data.max, function(err,rep){
          socket.emit('messagelist', rep);
        });
      });
      //socket.emit('channel', {name: 'default'});
      
      /* Update a single user's data, including game specific information */
      socket.on('updateuser', function(data) {
        self.storage.checkUserToken( data.name, data.token, function(isok) {
          if (isok) {
            self.storage.updateUserData( data, function(err,rep) {
              var myrooms = self.getRooms(socket.id);
              for(var k in myrooms) {
                if ( k != '' ) {
                  var room = k.substr(1);
                  self.storage.sendUserDataList( room );
                }
              }
            });
          }
        });
      });
      
      socket.on('setinit', function(data) {
        self.storage.checkUserToken( data.name, data.token, function(isok) {
          if (isok) {
            self.storage.getGM( data.group, function(err,rep) {
              if (rep == data.name) {
                self.storage.setCurrentInitiative( data.group, data.playername, function(err,rep) {
                  self.sendToGroup( data.group, 'newinit', data.playername );
                });
              }
            });
          }
        });
      });
      
      /* Someone wants to be awesome */
      socket.on('becomegm', function(data) {
        console.log("Someone wants to be GM: " + data.name);
        self.storage.checkUserToken( data.name, data.token, function(isok) {
          if (isok) {
            console.log("good token");
            self.storage.getGM( data.group, function(err,rep) {
              if (rep) {
                socket.emit('noway', {message: "There's already a GM for this room."});
              } else {
                self.storage.setGM( data.group, data.name, function(err,rep) {
                  self.io.sockets.in(data.group).emit('newgm', data.name);
                });
              }
            });
          }
        });
      });
      /* That is it for setting up all the responses to incoming client events */
    });
  },
  sendToGroup: function( group, msg, data ) {
    this.io.sockets.in(group).emit(msg, data);
  },
  sendToEveryone: function( msg, data ) {
    this.io.sockets.emit( msg, data );
  },
  getRooms: function(id) {
    return this.io.sockets.manager.roomClients[id];
  }
}

exports.listen = function(app) {
  var iosockets = require('socket.io').listen(app);
  iosockets.set('log level', 1);
  hub.io = iosockets;
  hub.storage = storage;
  storage.ansible = hub;
  hub.startup();
}
