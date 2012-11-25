ANSIBLE
=======

### Purpose

Ansible is aiming at a system for communicating game-related information.
Game-related, in this case, means table-top rpg related. Things such as
initiative, status, etc. as well as simple instant messaging.

It uses node.js, websockets, and redis.

It is currently in planning/early development stage.

### How to Make it Work

It's designed to work on the dotcloud service, but you can make it work on a local host.

It looks for a file in the same directory as the `server.js` called `envloc.json`. This file
is a json hash with one key `"ENV_FILE_LOCATION"` that contains the location of the
`environment.json` file.  This file is also a json hash that must contain at least
`"DOTCLOUD_DATA_REDIS_HOST"` with the host name of the redis instance,
and `"DOTCLOUD_DATA_REDIS_PORT"` with the port number.

Remeber to do `npm install -d` before starting node so that it will install all the
dependencies.

### The Sample Client (index.html and ansible.js)

This is really a sample. Really really. The idea behind this server is to implement all kinds
of cool stuff in the client, whether a web page, or mobile app, or regular desktop app, or
dashboard widget, or etc. Websockets are just sockets that use an initial http handshake but
then work like regular sockets.

## Events Sent to Clients

### `ack`
Some commands (like `register`) get this response, sometimes by itself, sometimes along with other
messages. Usually a `1` is a success and `0` a failure.

### `newmessage`
This is sent to anyone in a group where a new chat message has arrived. It contains
only the unique message id. Send a `read` with this id in order to get the `message` event.

### `message`
This is a single message. Contains group(room) name, user who sent it, and text of message.
These are only for chat messages.

### `userlist`
This is a list of all the users in the room you are currently in.

### `grouplist`
This is a list of all the rooms(groups) that are currently occupied. The way the system
works there are no empty rooms, and rooms are created as they are joined. Any time someone
joins any group, this event is sent to every connection to let clients update their list.

## Events Clients Send

### `register {group: <group>, name: <name>}`
This attempts to register a username in a group. If it works, that user joins that room.
If that username is already in that room, it fails. (When I implement hash tokens, this
will also fail if you aren't the one who registered that username)

### `users {group: <group>}`
The client is asking for an updated user list for the room.

### `read {id: <message id>}`
This requests the details of a message. Right now, there's nothing stopping reading any
message from any room, given the id.

### `grpmsg {group: <group>, fromuser: <user name>, text: <message text>}`
This sends a 'chat' message to a group from a particular user. (Again, implementing hash
tokens will prevent people sending messages as other people... not that it matters that much)

### `grouplisting`
Request a list of all the rooms. (Rooms only exist if users are in them, because they are redis
sets of usernames).

### `messagelist {group: <group>, max: <max messages>}`
Request the `<max>` most recent messages in a group. Don't know how useful this is, maybe for a
catchup feature?
