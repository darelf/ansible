function setup() {
  $("#sendbutton").attr("disabled", "disabled");
  // Get this party started
  var socket = start_sockets('ws://localhost:8080');
  // set up some events
  $("#login").on('click', function() { if ( $("#uname").val() != "" ) {
      socket.emit('register', {group: 'default', name: $("#uname").val()});
      $("#sendbutton").removeAttr("disabled");
    }
  });
  $("#sendbutton").on('click', function() {
    if ($("#msginput").val() != "")
      socket.emit('grpmsg', {group: "default",
                              name: $("#uname").val(),
                              text: $("#msginput").val()});
  });
  $("#gameselectMenu").on('click', function(ev) {
    $("#gameselectInput").val($(ev.target).text());
  });
  $("#gameselectButton").on('click', function() {
    var room = $("#gameselectInput").val();
    if (room == '')
      room = 'default';
    if ( $("#uname").val() != "" ) {
      socket.emit('register', {group: room, name: $("#uname").val()});
    }
  });
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

  return socket;
}