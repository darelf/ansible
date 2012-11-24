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

