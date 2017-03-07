import sinon from 'sinon';
import chai from 'chai';
import sinonChai from 'sinon-chai';

import DBuilder from '../index.js';

chai.use(sinonChai);
const expect = chai.expect;

describe('DBuilder', () => {
  let instance;
  beforeEach(() => {
    instance = new DBuilder({
      name: 'test',
      port: 3306,
      exposed: 5432,
      envs: { test: 1 },
      image: './test/fixtures/psql.Dockerfile'
    });
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(instance.name).to.equal('test');
      expect(instance.port).to.equal('3306');
      expect(instance.exposed).to.equal('5432');
      expect(instance.image).to.contain('fixtures/psql.Dockerfile');
      expect(instance.builder).to.equal(null);
      expect(instance.envs[0]).to.be.equal('test=1');
      expect(instance.on).to.be.a('function');

      expect(instance.ports).to.deep.equal({
        '5432/tcp': [{ HostPort: '3306' }]
      });
      expect(instance.docker).to.be.an('object');
    });
  });

  describe('DBuilder#build', () => {
    let stub;
    let promiseStub;

    beforeEach(() => {
      stub = {
        on: sinon.stub()
      };

      promiseStub = sinon.stub(DBuilder, 'Promise');
      sinon.stub(DBuilder, 'build').returns(stub);
      instance.build();
    });

    afterEach(() => {
      DBuilder.build.restore();
      DBuilder.Promise.restore();
    });

    it('should define builder property', () => {
      expect(DBuilder.builder).to.be.not.equal(null);
    });

    it('should return correct value', () => {
      expect(DBuilder.build).to.have.returned(stub);
    });

    it('should pass to build method correct arguments', () => {
      expect(DBuilder.build).to.have.been.calledWith(instance.image, {
        t: 'test'
      });
    });

    describe('promise execution', () => {
      let resolveStub;
      let listContainersStub;
      let listContainersCb;

      beforeEach(() => {
        resolveStub = sinon.stub();
        listContainersStub = sinon.stub();
        listContainersCb = sinon.stub();

        sinon.stub(instance, 'emit');
        sinon.stub(instance.docker, 'listContainers').returns(listContainersStub);

        // Execute promise callback
        promiseStub.firstCall.args[0](resolveStub);

        // Execute events callback
        stub.on.firstCall.args[1]();
        stub.on.secondCall.args[1]();

        // Execute listContainers callback
        listContainersCb = instance.docker.listContainers.firstCall.args[1];
      });

      afterEach(() => {
        instance.emit.restore();
      });

      it('should add "complete" event', () => {
        expect(stub.on).to.be.calledWith('complete');
      });

      it('should add "downloadProgress" event', () => {
        expect(stub.on).to.be.calledWith('downloadProgress');
      });

      it('should emit "complete" event', () => {
        expect(instance.emit).to.be.calledWith('complete');
      });

      it('should emit "download" event', () => {
        expect(instance.emit).to.be.calledWith('download');
      });

      it('should call "listContainers" method', () => {
        expect(instance.docker.listContainers).to.be.calledWith({ all: true });
      });

      it('should emit error if error is passed', () => {
        listContainersCb('error');

        expect(instance.emit).to.be.calledWith('error');
      });

      it('should not error if error is not passed', () => {
        listContainersCb(null, []);

        expect(instance.emit).to.not.be.calledWith('error');
      });

      it('should resolve the build promise right away', () => {
        listContainersCb(null, []);

        expect(resolveStub).to.have.been.called;
      });

      it('should resolve the build promise right away', () => {
        listContainersCb(null, []);

        expect(resolveStub).to.have.been.called;
      });

      it('should call DBuilder#stopAndRemove method', () => {
        const promise = new Promise(() => {});

        sinon.stub(instance, 'stopAndRemove').returns(promise);
        listContainersCb(null, [{ Id: 'test', Image: 'test' }]);

        expect(instance.stopAndRemove).to.have.been.calledWith('test');
        instance.stopAndRemove.restore();
      });
    });
  });

  describe('DBuilder#stopAndRemove', () => {
    beforeEach(() => {
      sinon.stub(instance, 'stop').returns(new Promise(resolve => resolve()));
      sinon.stub(instance, 'remove').returns(new Promise(resolve => resolve()));

      return instance.stopAndRemove('test');
    });

    afterEach(() => {
      instance.stop.restore();
      instance.remove.restore();
    });

    it('should have call "stop" method', () => {
      expect(instance.stop).to.have.been.calledWith('test');
    });

    it('should have call "remove" method', () => {
      expect(instance.remove).to.have.been.calledWith('test');
    });
  });

  describe('DBuilder#stop', () => {
    let dockerStub;
    let call;

    beforeEach(() => {
      dockerStub = {
        stop: sinon.stub().returns(new Promise(resolve => resolve()))
      };

      sinon.stub(instance.docker, 'getContainer').returns(dockerStub);

      call = instance.stop('test');
    });

    afterEach(() => {
      instance.docker.getContainer.restore();
    });

    it('should have call getContainer with correct argument', () => {
      expect(instance.docker.getContainer).to.have.been.calledWith('test');
    });

    it('should have call dockerode "stop" method', () => {
      expect(dockerStub.stop).to.have.been.called;
    });

    describe('success', () => {
      let fn;

      beforeEach(() => {
        fn = dockerStub.stop.firstCall.args[0];
      });

      it('resolves promise', () => {
        fn(null);
        return call;
      });
    });

    describe('error', () => {
      let fn;

      beforeEach(() => {
        sinon.stub(instance, 'emit');
        fn = dockerStub.stop.firstCall.args[0];
      });

      afterEach(() => {
        instance.emit.restore();
      });

      it('rejects promise', () => {
        fn({});

        return call.then(() => {
          expect(false).to.equal(true);
        }).catch(() => {
          expect(true).to.equal(true);
        });
      });

      it('emits error', () => {
        const object = {};

        fn(object);

        return call.then(() => {
          expect(false).to.equal(true);
        }).catch(() => {
          instance.emit.calledWith('error', object);
          expect(true).to.equal(true);
        });
      });

      it('resolves promise with 304 status code', () => {
        const object = { statusCode: 304 };

        fn(object);

        return call;
      });
    });
  });

  describe('DBuilder#remove', () => {
    let dockerStub;
    let call;

    beforeEach(() => {
      dockerStub = {
        remove: sinon.stub().returns(new Promise(resolve => resolve()))
      };

      sinon.stub(instance.docker, 'getContainer').returns(dockerStub);

      call = instance.remove('test');
    });

    afterEach(() => {
      instance.docker.getContainer.restore();
    });

    it('should have call getContainer with correct argument', () => {
      expect(instance.docker.getContainer).to.have.been.calledWith('test');
    });

    it('should have call dockerode "remove" method', () => {
      expect(dockerStub.remove).to.have.been.called;
    });

    describe('success', () => {
      let fn;

      beforeEach(() => {
        fn = dockerStub.remove.firstCall.args[0];
      });

      it('resolves promise', () => {
        fn(null);
        return call;
      });
    });

    describe('error', () => {
      let fn;

      beforeEach(() => {
        sinon.stub(instance, 'emit');
        fn = dockerStub.remove.firstCall.args[0];
      });

      afterEach(() => {
        instance.emit.restore();
      });

      it('rejects promise', () => {
        fn({});

        return call.then(() => {
          expect(false).to.equal(true);
        }).catch(() => {
          expect(true).to.equal(true);
        });
      });

      it('emits error', () => {
        const object = {};

        fn(object);

        return call.then(() => {
          expect(false).to.equal(true);
        }).catch(() => {
          instance.emit.calledWith('error', object);
          expect(true).to.equal(true);
        });
      });
    });
  });

  describe('DBuilder.getId', () => {
    it('should get id from string', () => {
      expect(DBuilder.getId('in use by container test.')).to.equal('test');
    });

    it('should get id from object', () => {
      expect(DBuilder.getId({
        message: 'in use by container test.'
      })).to.equal('test');
    });

    it('should not get id from string', () => {
      expect(DBuilder.getId('in use by containerS test.')).to.equal(false);
    });

    it('should not get id from object', () => {
      expect(DBuilder.getId({
        message: 'in use by containerS test.'
      })).to.equal(false);
    });
  });

  describe('DBuilder#run', () => {
    let resolveStub;
    let rejectStub;
    let dockerStub;
    let promiseStub;
    let createCb;
    let attachCb;

    beforeEach(() => {
      promiseStub = sinon.stub(DBuilder, 'Promise');
      resolveStub = sinon.stub();
      rejectStub = sinon.stub();
      dockerStub = {
        attach: sinon.stub(),
        start: sinon.stub()
      };

      sinon.stub(instance.docker, 'createContainer').returns(dockerStub);

      instance.run();

      // Execute promise callback
      promiseStub.firstCall.args[0](resolveStub, rejectStub);

      createCb = instance.docker.createContainer.firstCall.args[1];
    });

    afterEach(() => {
      instance.docker.createContainer.restore();
      DBuilder.Promise.restore();
    });

    it('should have call createContainer with correct argument', () => {
      expect(instance.docker.createContainer).to.have.been.calledWith({
        Image: instance.name,
        name: instance.name,
        Env: instance.envs,
        PortBindings: instance.ports
      });
    });

    describe('409 (conflict) error', () => {
      const containerName = 1111;

      beforeEach(() => {
        sinon.stub(instance, 'stopAndRemove').returns(new Promise(resolve => resolve()));
        sinon.stub(instance, 'run').returns(new Promise(resolve => resolve()));

        createCb({
          statusCode: 409,
          json: `in use by container ${containerName}.`
        });
      });

      afterEach(() => {
        instance.stopAndRemove.restore();
        instance.run.restore();
      });

      it('should call `stopAndRemove` method', () => {
        expect(instance.stopAndRemove).to.have.been.calledWith(containerName.toString());
      });

      it('should call `run` method', (done) => {
        // Since we need to wait for the next tick to reach `run` call
        setTimeout(() => {
          expect(instance.run).to.have.been.called;
          done();
        });
      });

      it('should throw to return promise', () => {
        instance.run.restore();

        sinon.stub(instance, 'run').throws(Error('test'));

        return instance.stopAndRemove.firstCall.returnValue;
      });
    });

    describe('success', () => {
      let streamStub;

      beforeEach(() => {
        streamStub = {
          on: sinon.stub()
        };

        sinon.stub(instance, 'emit');
        createCb(null, dockerStub);
        attachCb = dockerStub.attach.firstCall.args[1];
        attachCb(null, streamStub);
      });

      afterEach(() => {
        instance.emit.restore();
      });

      it('should dockerode "attach" method with correct arguments', () => {
        expect(dockerStub.attach).to.have.been.calledWith({
          stream: true,
          stdout: true,
          stderr: true
        });
      });

      it('should add "data"\'s event', () => {
        expect(streamStub.on).to.have.been.calledTwice;
      });

      it('should resolve "run" promise', () => {
        streamStub.on.firstCall.args[1]();
        expect(resolveStub).to.have.been.called;
      });

      it('should emit "data" event', () => {
        streamStub.on.secondCall.args[1]('data emit');
        expect(instance.emit).to.have.been.calledWith('data', 'data emit');
      });

      describe('error at dockerode "start" method', () => {
        beforeEach(() => {
          dockerStub.start.firstCall.args[0]('bad things');
        });

        it('should dockerode "start" method for error case', () => {
          expect(instance.emit).to.have.been.calledWith('error', 'bad things');
        });

        it('should dockerode "start" method for error case', () => {
          expect(rejectStub).to.have.been.called;
        });

        it('should emit error and reject promise in correct order', () => {
          expect(instance.emit).to.be.calledBefore(rejectStub);
        });
      });
    });

    describe('error', () => {
      beforeEach(() => {
        sinon.stub(instance, 'emit');
        createCb('error', dockerStub);
      });

      it('should reject promise', () => {
        expect(rejectStub).to.have.been.called;
      });

      it('should emit error', () => {
        expect(instance.emit).to.have.been.calledWith('error');
      });

      it('should emit error and reject promise in correct order', () => {
        expect(instance.emit).to.be.calledBefore(rejectStub);
      });

      it('should not resolve, only reject', () => {
        expect(resolveStub).to.not.been.called;
      });

      it('should emit success emit', () => {
        expect(instance.emit).to.not.have.been.calledWith('stopped and removed');
      });
    });
  });

  describe('DBuilder#up', () => {
    let up;

    beforeEach(() => {
      sinon.stub(instance, 'build').returns(new Promise(resolve => resolve()));
      sinon.stub(instance, 'run').returns(new Promise(resolve => resolve()));

      up = instance.up();
      return up;
    });

    afterEach(() => {
      instance.build.restore();
      instance.run.restore();
    });

    it('should call DBuilder#build method', () => {
      expect(instance.build).to.be.called;
    });

    it('should call DBuilder#run method', () => {
      expect(instance.run).to.be.called;
    });
  });

  describe('DBuilder#pump', () => {
    beforeEach(() => {
      sinon.stub(DBuilder, 'pump');
      sinon.stub(console, 'error');
      instance.pump();
      DBuilder.pump.firstCall.args[2]('test');
    });

    afterEach(() => {
      DBuilder.pump.restore();
      console.error.restore();
    });

    it('should be called with correct arguments', () => {
      expect(DBuilder.pump).to.be.calledWith(instance.builder, process.stdout);
    });

    it('should execute "console.error" if there is an error', () => {
      expect(console.error).to.be.calledWith('test');
    });
  });
});
