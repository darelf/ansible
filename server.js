var fs = require('fs');
var envfloc = JSON.parse(fs.readFileSync('envloc.json', 'utf-8'));
var env = JSON.parse(fs.readFileSync(envfloc['ENV_FILE_LOCATION'], 'utf-8'));

var st = require('node-static');
var file = new st.Server('./public');

var app = require('http').createServer(handler),
  io = require('socket.io').listen(app),
  crypto = require('crypto'),
  redis = require('redis'),
  client = redis.createClient(env['DOTCLOUD_DATA_REDIS_PORT'],
                              env['DOTCLOUD_DATA_REDIS_HOST']);

io.set('log level', 2);
if (env['DOTCLOUD_DATA_REDIS_PASSWORD'] != '')
  client.auth(env['DOTCLOUD_DATA_REDIS_PASSWORD']);

app.listen(8080);

function handler(req,res) {
  req.addListener('end', function() {
    file.serve(req,res);
  })
}

io.sockets.on('connection', function(socket) {
  console.log("Client connected using " + io.transports[socket.id].name);
  socket.on('register', function(data) {
    if (data.token) {
      checkUserToken(function(itworked) {
        if (itworked) {
          moveUserGroup(socket, data, function(err,rep) {
            
          });
        }
      });
    } else {
      registerNewUser(socket, data, function(itworked) {
        socket.emit('ack', itworked);
      });
    }
  });
  socket.on('users', function(data) {
    listUsers(data.group, function(err,rep) { socket.emit('userlist', rep); } );
  });
  socket.on('read', function(data) {
    readMessage( data.id, function(err, rep) { socket.emit('message', rep); });
  });
  socket.on('grpmsg', function(data) {
    sendGroupMessage( data.group, data.name, data.text, function(x) {
      socket.emit('ack', x);
      io.sockets.in(data.group).emit('newmessage', x);
    });
  });
  socket.on('grouplisting', function() {
    getGroupList(function(err, rep) { socket.emit('grouplist', rep); });
  })
  socket.on('getmessagelist', function(data) {
    messageList( data.group, data.max, function(err,rep){
      socket.emit('messagelist', rep);
    });
  });
  //socket.emit('channel', {name: 'default'});
});

function addUser( group, name, callback ) {
  client.sadd( "groups:" + group, name, callback );
  client.sadd( "groups", group );
}

function removeUser( group, name, callback ) {
  client.srem( "groups:" + group, name, callback );
  client.exists( "groups:" + group, function(err, rep) {
    if (rep == 0)
      client.srem( "groups", group );
  });
}

function removeUserFromAllGroups( name ) {
  client.smembers( "groups", function(err,rep) {
    for(var i = 0; i < rep.length; i++) {
      var group = rep[i];
      removeUser(group, name, function(err,rep) {
        listUsers(group, function(err,rep) { io.sockets.in(group).emit('userlist', rep)});
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

function setInit( group, uname, initiative, callback ) {
  client.hmset( "groups:" + group + ":init", {username: uname, init: initative}, callback );
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

/* New user token system, 24 byte base64 random data */
function getNewToken() {
  return crypto.randomBytes(24).toString('base64');
}

function registerNewUserToken(user, callback) {
  var token = getNewToken();
  client.exists(token, function(err,rep) {
    if ( rep == 0 ) {
      client.setex(token, 1800, user);
      callback(token);
    } else {
      registerNewUserToken(user, callback);
    }
  });
}

function checkUserToken(user, token, callback) {
  client.get(token, function(err, rep) {
    callback( (rep == token) );
  });
}

function moveUserGroup(socket, data, callback) {
  //Let's leave all the other rooms before joining a new one
  var myrooms = io.sockets.manager.roomClients[socket.id];
  for(var k in myrooms) {
    if ( k != '' ) {
      var room = k.substr(1);
      socket.leave(room);
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
   })
  });
  socket.on('disconnect', function() {
    console.log("Received Disconnect");
    removeUser(data.group, data.name, function(err,rep) {
      listUsers(data.group, function(err,rep) { io.sockets.in(data.group).emit('userlist', rep)});
    });
  });
}

function registerNewUser(socket, data, callback) {
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
   })
  });
  
  socket.on('disconnect', function() {
    console.log("Received Disconnect");
    removeUser(data.group, data.name, function(err,rep) {
      listUsers(data.group, function(err,rep) { io.sockets.in(data.group).emit('userlist', rep) });
    });
  });
}
