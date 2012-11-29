/* Allow us to serve the sample client website */
var st = require('node-static');
var file = new st.Server('./public');

/* get our stuff together */
var app = require('http').createServer(handler)

/* Set up the ansible */
var ansible = require('./ansiblehub.js').listen(app);
app.listen(8080);


/* A function for serving the sample client */
function handler(req,res) {
  req.addListener('end', function() {
    file.serve(req,res);
  })
}


