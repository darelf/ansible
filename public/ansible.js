
function start_sockets(url) {
  var socket = io.connect(url);
  socket.on('channel', function(data) {
    console.log(data.name);
    //$("#channel").val(data.name);
    socket.emit('users', { group: 'default' });
  });
  socket.on('message', function(data) {
    if ( data.type == 'chat' ) {
    
    }
  });
  socket.on('ack', function(data) { console.log(data); });
  socket.on('userlist', function(data) {
   console.log(data);
   $("#userlist").html("");
   $("#numusers").html(data.length);
   data.forEach(function(val, i) {
     $("#userlist").append("<span class='label label-info'>" + val + "</span> ");
   });
  });
  $("#login").on('click', function() { if ( $("#uname").val() != "" ) {
      socket.emit('register', {group: 'default', name: $("#uname").val()});
    }
  });
  $("#sendbutton").on('click', function() {
    if ($("#msginput").val() != "")
      socket.emit('message', {group: $("#channel").val(),
                              text: $("#msginput").val()});
  });
}