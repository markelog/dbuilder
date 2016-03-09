[![Build Status](https://travis-ci.org/markelog/dbuilder.svg?branch=master)](https://travis-ci.org/markelog/dbuilder)
[![Coverage Status](https://coveralls.io/repos/github/markelog/dbuilder/badge.svg?branch=master)](https://coveralls.io/github/markelog/dbuilder?branch=master)

# Programatically build docker container
## Use-case
When you need to programatically build, create (stop and remove it if duplicate container already exist), attach and start container -

## Usage
```js
new DBuilder({
  name: 'cool-one', // Will be used at build and when runned
  port: 3306, // Host port
  exposed: 5432, // Container port, that need to correlate with the one in Dockerfile
  envs: { test: 1 }, // Environment variable which will be used when container is started
  image: 'path' // Path to docker file
}).up(() => {
  console.log('done and done');
});
```

### Listen to events
```js
let builder = new DBuilder(...);
builder.on('complete', () => {});
builder.on('run', () => {});
builder.on('stopped and removed', () => {});
builder.on('error', error => {});
builder.on('data', data => {});
builder.up(() => ...);
```

## Run tests
In order to run tests you should have installed and running docker.
