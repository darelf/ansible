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

/* A holder. Nothing works until listen() is called */
var io;

/* What to do when a new connection comes in */
var startup = function() {
  io.sockets.on('connection', function(socket) {
    console.log("Client connected using " + io.transports[socket.id].name);
    /* Register action. */
    socket.on('register', function(data) {
      if (data.token) {
        console.log("user has a token: " + data.token);
        checkUserToken(data.name, data.token, function(itworked) {
          console.log(itworked);
          if (itworked) {
            console.log("user token checked out");
            moveUserGroup(socket, data, function(err,rep) {
              socket.emit('ack', 1);
            });
          }
        });
      } else {
        console.log("user does not have a token");
        registerNewUser(socket, data, function(itworked) {
          socket.emit('ack', itworked);
          if (itworked) {
            changeInitiative(data.name, '0', function(err, rep) {
              if (err) console.log(err);  
            });
          }
        });
      }
    });
    /* They want a list of users */
    socket.on('users', function(data) {
      listUsers(data.group, function(err,rep) { socket.emit('userlist', rep); } );
    });
    /* They want to read a single post by id */
    socket.on('read', function(data) {
      readMessage( data.id, function(err, rep) { socket.emit('message', rep); });
    });
    /* They want to send a chat post to a certain group */
    socket.on('grpmsg', function(data) {
      sendGroupMessage( data.group, data.name, data.text, function(x) {
        io.sockets.in(data.group).emit('newmessage', x);
      });
    });
    /* They want to know what groups are currently active on this server */
    socket.on('grouplisting', function() {
      getGroupList(function(err, rep) { socket.emit('grouplist', rep); });
    });
    /* They want a list of the most recent post ids for a group */
    socket.on('getmessagelist', function(data) {
      messageList( data.group, data.max, function(err,rep){
        socket.emit('messagelist', rep);
      });
    });
    //socket.emit('channel', {name: 'default'});
    
    /* Update a single user's data, including game specific information */
    socket.on('updateuser', function(data) {
      checkUserToken( data.name, data.token, function(isok) {
        if (isok) {
          updateUserData( data, function(err,rep) {
            var myrooms = io.sockets.manager.roomClients[socket.id];
            for(var k in myrooms) {
              if ( k != '' ) {
                var room = k.substr(1);
                sendUserDataList( room );
              }
            }
          });
        }
      });
    });
    
    /* Someone wants to be awesome */
    socket.on('becomegm', function(data) {
      console.log("Someone wants to be GM: " + data.name);
      checkUserToken( data.name, data.token, function(isok) {
        if (isok) {
          console.log("good token");
          getGM( data.group, function(err,rep) {
            if (rep) {
              socket.emit('noway', {message: "There's already a GM for this room."});
            } else {
              setGM( data.group, data.name, function(err,rep) {
                io.sockets.in(data.group).emit('newgm', data.name);
              });
            }
          });
        }
      });
    });
    /* That is it for setting up all the responses to incoming client events */
  });
}

/* Game specific functions */
function setGM( group, uname, callback ) {
  client.set( "groups:gm:" + group, uname, callback );
}

function getGM( group, callback ) {
  client.get( "groups:gm:" + group, callback );
}

function setCurrentInitiative( group, uname, callback ) {
  client.set( "groups:curinit:" + group, uname, callback);
}

function getCurrentInitiative( group, callback ) {
  client.get( "groups:curinit:" + group, callback );
}

function changeInitiative( uname, initiative, callback ) {
  console.log("setting key data:" + uname);
  client.hmset( "data:" + uname, {name: uname, init: initiative}, callback);
}

function updateUserData( data, callback ) {
  client.hmset( "data:" + data.name, {name: data.name, init: data.init, condition: data.condition}, callback );
}

function getUserData( name, callback ) {
  client.hgetall( "data:" + name, callback );
}

function sendUserDataList( group ) {
  io.sockets.in(group).emit('clearuserlist');
  listUsers( group, function(err, rep) {
    rep.forEach(function(val, i) {
      getUserData( val, function(err2, rep2) {
        io.sockets.in(group).emit('updateinit', rep2);
      });
    });
  });
}

/* Basic functions */

function addUser( group, name, callback ) {
  client.sadd( "groups:" + group, name, callback );
  client.sadd( "groups", group );
}

function removeUser( group, name, callback ) {
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
}

function removeUserFromAllGroups( name ) {
  client.smembers( "groups", function(err,rep) {
    for(var i = 0; i < rep.length; i++) {
      var group = rep[i];
      removeUser(group, name, function(err,rep) {
        listUsers(group, function(err,rep) { io.sockets.in(group).emit('userlist', rep)});
        sendUserDataList(group);
      });
    }
  });
}

function listUsers( group, callback ) {
  client.smembers( "groups:" + group, callback );
}

function getGroupList( callback ) {
  client.smembers( "groups", callback );
}

function readMessage( id, callback ) {
  client.hgetall("post:" + id, callback);
}

function messageList( group, max, callback ) {
  client.lrange("inbox:group:" + group, 0, max, callback );
}

function sendGroupMessage( group, uname, message, callback ) {
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
}


/* We need to check if the token already exists */
function registerNewUserToken(user, callback) {
  var token = getNewToken();
  client.exists(token, function(err,rep) {
    if ( rep == 0 ) {
      console.log("setting token for " + user + " to " + token);
      client.setex(token, 1800, user);
      client.setex( "users:" + user, 1800, token );
      callback(token);
    } else {
      registerNewUserToken(user, callback);
    }
  });
}

/* Validate parking... I mean, user token */
function checkUserToken(user, token, callback) {
  client.get(token, function(err, rep) {
    callback( (rep == user) );
  });
}

function notifyGMStatus(group, socket) {
  getGM( group, function(err,rep) {
    if (rep)
      socket.emit('newgm', rep);
    else
      socket.emit('newgm', '');
      
    sendUserDataList(group);
  });
}

/* We are moving a user from one group to another
   and notifying everyone of what happened */
function moveUserGroup(socket, data, callback) {
  //Let's leave all the other rooms before joining a new one
  var myrooms = io.sockets.manager.roomClients[socket.id];
  for(var k in myrooms) {
    if ( k != '' ) {
      var room = k.substr(1);
      socket.leave(room);
      console.log("removing user " + data.name + " from " + room);
      removeUser( room, data.name, function(err, rep) {
        //Tell the old group about the updated userlist
        listUsers( room, function(err, rep) {
          io.sockets.in(room).emit('userlist', rep);
        });
      });
    }
  }
  //join the new room
  socket.join(data.group);
  addUser(data.group, data.name, function(err,rep) {
    callback(err, rep);
    //Update the new group with the new user list
    listUsers(data.group, function(err,rep) {
      io.sockets.in(data.group).emit('userlist',rep)
    });
    //Let everyone know about the new room list
    getGroupList(function(err, rep) {
      io.sockets.emit('grouplist', rep);
    });
    //Let this guy know if there is already a GM for that group
    notifyGMStatus( data.group, socket );
  });
  socket.on('disconnect', function() {
    console.log("Received Disconnect");
    //Expire token.. this leave the opposite, but that can be
    //considered a feature in this case.
    client.del(data.name);

    removeUser(data.group, data.name, function(err,rep) {
      listUsers(data.group, function(err,rep) { io.sockets.in(data.group).emit('userlist', rep)});  
      sendUserDataList(data.group);
    });
  });
}

function registerNewUser(socket, data, callback) {
  client.exists( data.name, function(err,rep) {
    if (rep == 0) {
      registerNewUserToken(data.name, function(token) {
        socket.emit('newtoken', token);
      });
      
      socket.join(data.group);
      addUser(data.group, data.name, function(err,rep) {
        callback(rep);
        //Update the new group with the new user list
        listUsers(data.group, function(err,rep) {
          io.sockets.in(data.group).emit('userlist',rep);
        });
        //Let everyone know about the new room list
        getGroupList(function(err, rep) {
          io.sockets.emit('grouplist', rep);
        });
        //Let this guy know if there is already a GM for that group
        notifyGMStatus( data.group, socket );
      });
      
      socket.on('disconnect', function() {
        console.log("Received Disconnect");
        //Expire token.. this leave the opposite, but that can be
        //considered a feature in this case.
        client.del(data.name);
        removeUser(data.group, data.name, function(err,rep) {
          listUsers(data.group, function(err,rep) { io.sockets.in(data.group).emit('userlist', rep) });      
          sendUserDataList(data.group);
        });
      });
    } else {
      //Let the user know this name is already taken
      callback(0);
    }
  });
}



exports.listen = function(app) {
  io = require('socket.io').listen(app);
  io.set('log level', 1);
  startup();
  return io;
}