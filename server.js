var fs = require('fs');
var env = JSON.parse(fs.readFileSync('/home/dotcloud/environment.json', 'utf-8'));

var st = require('node-static');
var file = new st.Server('./public');

var app = require('http').createServer(handler),
  io = require('socket.io').listen(app),
  redis = require('redis'),
  client = redis.createClient(env['DOTCLOUD_DATA_REDIS_PORT'],
                              env['DOTCLOUD_DATA_REDIS_HOST']);

io.set('log level', 2);
client.auth(env['DOTCLOUD_DATA_REDIS_PASSWORD']);
app.listen(8080);

function handler(req,res) {
  req.addListener('end', function() {
    file.serve(req,res);
  })
}

io.sockets.on('connection', function(socket) {
  socket.on('register', function(data) {
    socket.join(data.group);
    addUser(data.group, data.name, function(err,rep) {
     socket.emit('ack', rep);
     listUsers(data.group, function(err,rep) {io.sockets.in(data.group).emit('userlist',rep)});
    });
    socket.on('disconnect', function() {
      console.log("Received Disconnect");
      removeUser(data.group, data.name, function(err,rep) {
        listUsers(data.group, function(err,rep) { io.sockets.in(data.group).emit('userlist', rep)});
      });
    });
  });
  socket.on('users', function(data) {
    listUsers(data.group, function(err,rep) { socket.emit('userlist', rep); } );
  });
  socket.on('read', function(data) {
    readMessage( data.id, callback );
  });
  //socket.emit('channel', {name: 'default'});
});

function addUser( group, name, callback ) {
  client.sadd( "groups:" + group, name, callback );
}

function removeUser( group, name, callback ) {
  client.srem( "groups:" + group, name, callback );
}

function listUsers( group, callback ) {
  client.smembers( "groups:" + group, callback );
}

function readMessage( id, callback ) {
  client.hgetall("post:" + id, callback);
}

/*
 addUser( group, uname ) -
   SADD <group> <uname>
 
 listMessages( uname, max ) -
   LRANGE <uname>:inbox 0 <max>
 
 sendMessage( group, uname, destination, message ) -
   SISMEMBER <group> <username>
   SISMEMBER <group> <destination>
 
   id = INCR post:nextMessageID
   HMSET post:<id> fromuser <m.from> type <m.type> text <m.text>
   LPUSH inbox:<destination> id
   LTRIM inbox:<destination> 0 100
   LPUSH outbox:<username> id
   LTRIM outbox:<username> 0 100
   
   LPUSH global:messages id
   if LLEN global:messages > 1000
     rid = RPOP global:messages
     DEL post:<rid>
 
   
 readMessage( id ) -
   GET post:<id>
*/
