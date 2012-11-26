var user_token = "";

function setup() {
  $("#sendbutton").attr("disabled", "disabled");
  // Get this party started
  var socket = start_sockets('wss://localhost:8080');
  // set up some events
  $("#login").on('click', function() { loginToRoom(socket) });
  
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
  }
}

function sendMessage(sock) {
  if ($("#msginput").val() != "")
  sock.emit('grpmsg', {group: "default",
                       name: $("#uname").val(),
                       text: $("#msginput").val()});
}

function displayWarning(txt) {
  $("#alertarea").append('<div class="alert alert-error">' +
    '<button type="button" class="close" data-dismiss="alert">x</button><strong>Hold Up!</strong> ' +
     txt + '</div>');
}

function displayMessage(m) {
  if (m.type == 'chat') {
    $("#chatbox").append('<li class="well well-small">' + m.text + '</li>');
  }
}

function start_sockets(url) {
  var socket = io.connect(url);
  socket.on('newtoken', function(token) {
    user_token = token;
  });
  
  socket.on('channel', function(data) {
    console.log(data.name);
    //$("#channel").val(data.name);
    socket.emit('users', { group: 'default' });
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
      displayWarning("Looks like that user is already joined to that room.");
    else
      $(".alert").alert("close");
  });
  
  socket.on('userlist', function(data) {
   console.log(data);
   $("#userlist").html("");
   $("#numusers").html(data.length);
   data.forEach(function(val, i) {
     $("#userlist").append("<span class='label label-info'>" + val + "</span> ");
   });
  });

  socket.on('grouplist', function(data) {
    $("#gameselectMenu").html("");
    data.forEach(function(val, i) {
      $("#gameselectMenu").append('<li><a href="#">' + val + '</a></li>');
    })
  });

  return socket;
}
