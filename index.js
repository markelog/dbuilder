import { resolve } from 'path';
import { stringify } from 'querystring';
import { EventEmitter } from 'events';

import pump from 'pump';

import Docker from 'dockerode';
import build from 'dockerode-build';

export default class DBuilder extends EventEmitter {
  /**
   * Promise constructor, for test stubbing
   * @static
   * @type {Function}
   */
  static Promise = Promise;
  /**
   * dockerode-build function, for test stubbing
   * @static
   * @type {Function}
   */
  static build = build;
  /**
   * pump function, for test stubbing
   * @static
   * @type {Function}
   */
  static pump = pump;

  /**
   * @constructor
   * @param {Object} opts
   * @param {String} opts.name - name of container, which will be used for build and run
   * @param {Number} opts.port - host port
   * @param {Number} opts.exposed - exposed container port, should correlate with "EXPOSED"
   * @param {Object} opts.envs - environment vars which will be used when starting container
   * @param {string} opts.image - image path
   */
  constructor(opts = {}) {
    super();

    /**
     * Name of the container
     * @type {String}
     */
    this.name = opts.name;

    /**
     * Host port
     * @type {String}
     */
    this.port = opts.port.toString();

    /**
     * Container port
     * @type {String}
     */
    this.exposed = opts.exposed.toString();

    /**
     * Image path
     * @type {[type]}
     */
    this.image = resolve(opts.image);

    /**
     * Environment vars which will be used when starting container
     * @type {String}
     */
    this.envs = opts.envs ? stringify(opts.envs).split('&') : '';

    /**
     * Event emitter instance
     * @type {EventEmitter}
     */
    this.events = new EventEmitter();

    /**
     * Dockerode object
     * @type {Object}
     */
    this.docker = new Docker();

    /**
     * Build instance
     * @type {Object}
     */
    this.builder = null;

    const portProtocol = `${this.exposed}/tcp`;

    /**
     * Ports map
     * @type {Object}
     */
    this.ports = {};
    this.ports[portProtocol] = [{
      HostPort: this.port.toString()
    }];
  }

  /**
   * Pump everything to the console
   * Useful for debug and when console is needed
   */
  pump() {
    DBuilder.pump(this.builder, process.stdout, (err) => {
      /* eslint-disable no-console */
      if (err) {
        console.error(err);
      }
    });

    return this;
  }

  /**
   * DBuilder#build -> DBuilder#run
   * @returns {Promise}
   */
  up() {
    return this.build().then(() => this.run());
  }

  /**
   * Build container
   * @return {Promise}
   */
  build() {
    this.builder = DBuilder.build(this.image, {
      t: this.name
    });

    return new DBuilder.Promise((res, reject) => {
      this.builder.on('downloadProgress', () => this.emit('download'));

      this.builder.on('complete', () => {
        this.emit('complete');

        this.docker.listContainers({ all: true }, (listError, containers) => {
          if (listError) {
            this.emit('error', listError);
            return;
          }

          const dup = containers.filter(container => container.Image === this.name)[0];

          if (!dup) {
            res();
          } else {
            this.stopAndRemove(dup.Id).then(res, reject);
          }
        });
      });
    });
  }

  /**
   * Stop and remove container
   * @param {String} id - container id
   * @return {Promise}
   */
  stopAndRemove(id) {
    return this.stop(id).then(() => {
      return this.remove(id).then(() => {
        this.emit('stopped and removed');
      });
    });
  }

  /**
   * Stop container
   * @param {String} id - container id
   * @return {Promise}
   */
  stop(id) {
    const container = this.docker.getContainer(id);

    return new Promise((res, rej) => {
      container.stop((error) => {
        if (error) {
          // Stopped container - don't consider this as an error
          if (error.statusCode === 304) {
            res();
            return;
          }

          this.emit('error', error);
          rej();
          return;
        }

        res();
      });
    });
  }

  /**
   * Remove container
   * @param {String} id - container id
   * @return {Promise}
   */
  remove(id) {
    const container = this.docker.getContainer(id);

    return new Promise((res, rej) => {
      container.remove((error) => {
        if (error) {
          this.emit('error', error);
          rej();
          return;
        }

        res();
      });
    });
  }

  /**
   * Get id from docker HTTP 409 error string
   * @static
   * @param {String | Object} response - newest version of docker return object,
   *                                      oldest return string
   * @return {String|Boolean}
   */
  static getId(response) {
    // No better way apparently :/
    const regexp = /in use by container (\w+)\./;

    if (typeof response === 'object') {
      response = response.message;
    }

    const result = response.match(regexp);

    if (result && result.length === 2) {
      return result[1];
    }

    return false;
  }

  /**
   * Create, attach and start container
   * @return {Promise}
   */
  run() {
    return new DBuilder.Promise((res, rej) => {
      this.docker.createContainer({
        Image: this.name,
        name: this.name,
        Env: this.envs,
        PortBindings: this.ports
      }, (createErr, container) => {
        if (createErr) {

          // If container with the same name already exist
          if (createErr.statusCode === 409) {
            const id = DBuilder.getId(createErr.json);

            // In case we wouldn't find anything
            if (id) {

              // Stop and remove it
              this.stopAndRemove(id).then(() => {
                // Then try again
                return this.run().then(res);
              }).catch(rej);

              return;
            }
          }

          this.emit('error', createErr);
          rej();
          return;
        }

        this.emit('run');

        container.attach({
          stream: true,
          stdout: true,
          stderr: true
        }, (attachErr, stream) => {
          stream.on('data', () => res());
          stream.on('data', data => this.emit('data', data.toString()));
        });

        container.start((startErr) => {
          if (startErr) {
            this.emit('error', startErr);
            rej();
          }
        });
      });
    });
  }
}
