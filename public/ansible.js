var user_token = "";
var condition = ['bleed', 'blinded', 'broken', 'confused', 'cowering', 'dazed', 'dazzled', 'dead',
                 'deafened', 'disabled', 'dying', 'energy drained', 'entangled', 'exhausted',
                 'fascinated', 'fatigued', 'flat-footed', 'frightened', 'grappled', 'helpless',
                 'incorporeal', 'invisible', 'nauseated', 'panicked', 'paralyzed', 'petrified',
                 'pinned', 'prone', 'shaken', 'sickened', 'sinking', 'stable', 'staggered',
                 'stunned', 'unconscious'];
var user_list = [];

function setup() {
  $("#sendbutton").attr("disabled", "disabled");
  // Get this party started
  var socket = start_sockets('wss://lxfinkbeinerd:8080');
  // set up some events
  $("#login").on('click', function() {
    loginToRoom(socket);
    //$("#login").attr("disabled", "disabled");
  });
  
  $("#sendbutton").on('click', function() { sendMessage(socket); });

  $("#msginput").on('keyup', function(ev) {
    if (ev.which == 13)
      sendMessage(socket);
  });

  $("#gameselectMenu").on('click', function(ev) {
    $("#gameselectInput").val($(ev.target).text());
  });

  $("#gameselectButton").on('click', function() { loginToRoom(socket) });
}

function loginToRoom(socket) {
  if ( $("#uname").val() != "" ) {
    var room = $("#gameselectInput").val();
    if (room == '') room = 'default';
    var vals = {group: room, name: $("#uname").val()};
    if (user_token != '') vals['token'] = user_token;
    socket.emit('register', vals);
    $("#sendbutton").removeAttr("disabled");
    $("#login").attr("disabled", "disabled");
  }
}

function sendMessage(sock) {
  if ($("#msginput").val() != "")
  sock.emit('grpmsg', {group: "default",
                       name: $("#uname").val(),
                       text: $("#msginput").val()});
}

function displayWarning(txt) {
  $("#alertarea").append('<div class="alert alert-error fade in">' +
    '<button type="button" class="close" data-dismiss="alert">x</button><strong>Hold Up!</strong> ' +
    txt + '</div>');
}

function displaySuccess(txt) {
  $("#alertarea").append('<div class="alert alert-success fade in">' +
    '<button type="button" class="close" data-dismiss="alert">x</button> ' +
    txt + '</div>');
}

function displayMessage(m) {
  if (m.type == 'chat') {
    $("#chatbox").append('<li class="well well-small">' + m.text + '</li>');
  }
}

function updateInitList() {
  user_list.sort(function(a,b) { return a.init - b.init; });
  console.log(user_list);
  var e = $("#initiativelist");
  e.html("");
  for( var i = 0; i < user_list.length; i++ ) {
    e.append('<li><span class="text-success">' + user_list[i].name + '</span></li>');
  }
}

function start_sockets(url) {
  var socket = io.connect(url);
  
  socket.on('connect', function() {
    displaySuccess("You have been connected to the Ansible system, please log in.");
  });
  
  socket.on('disconnect', function() {
    displayWarning("Looks like you were disconnected and logged out by the system, chief.");
    $("#login").removeAttr("disabled");
  });
  
  socket.on('newtoken', function(token) {
    user_token = token;
  });
  
  socket.on('channel', function(data) {
    console.log(data.name);
    //$("#channel").val(data.name);
    socket.emit('users', { group: data.name });
  });
  
  socket.on('newmessage', function(data) {
    socket.emit('read', {id: parseInt(data)});
  });
  
  socket.on('messagelist', function(data) {
    console.log(data);
    data.forEach(function(val, i) {
      socket.emit('read', {id: parseInt(val)});
    });
  });
  
  socket.on('message', displayMessage);
  
  socket.on('ack', function(data) {
    console.log(data);
    if (data == 0)
      displayWarning("Looks like that user name is already taken.");
    else
      $(".alert").alert("close");
  });
  
  socket.on('userlist', function(data) {
    var room = $("#gameselectInput").val();
    if (room == '') room = 'default';
    $("#roomname").html( "'" + room  + "'" );
    $("#numusers").html(data.length);
  });
  
  socket.on('clearuserlist', function() {
    console.log("clearing user list");
    user_list = [];
  })
  
  socket.on('updateinit', function(data) {
    user_list.push(data);
    updateInitList();
  });

  socket.on('grouplist', function(data) {
    $("#gameselectMenu").html("");
    data.forEach(function(val, i) {
      $("#gameselectMenu").append('<li><a href="#">' + val + '</a></li>');
    });
  });

  return socket;
}
