import Joi from 'joi';
import { expect } from 'chai';
import sinon from 'sinon';
import { createEventDispatcher } from 'octobus.js';
import { generateCRUDServices } from '../src';
import { MongoClient } from 'mongodb';

const databaseName = 'test-octobus';

const userSchema = {
  _id: Joi.object(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  email: Joi.string().email(),
  role: Joi.string(),
  age: Joi.number(),
  birthdate: {
    year: Joi.number(),
    day: Joi.number(),
  },
  hobbies: Joi.array().items(Joi.string()),
};

describe('generateCRUDServices', () => {
  let dispatcher;
  let db;

  before(() => (
    MongoClient.connect(`mongodb://localhost:27017/${databaseName}`).then((_db) => {
      db = _db;
    })
  ));

  beforeEach(() => {
    dispatcher = createEventDispatcher();

    return generateCRUDServices('entity.User', {
      db,
      schema: userSchema,
      collectionName: 'User',
      indexes: {
        email: 'email',
        fullname: ['firstName', 'lastName'],
      },
    }).then((map) => {
      dispatcher.subscribeMap('entity.User', map);
    });
  });

  afterEach(() => db.collection('User').remove());

  after(() => db.close());

  it('should call the create hooks', () => {
    const before = sinon.spy();
    const after = sinon.spy();
    dispatcher.onBefore('entity.User.create', before);
    dispatcher.onAfter('entity.User.create', after);
    return dispatcher.dispatch('entity.User.create', {
      firstName: 'John',
      lastName: 'Doe',
    }).then(() => {
      expect(before).to.have.been.calledOnce();
      expect(after).to.have.been.calledOnce();
    });
  });

  it('should create a new record', () => (
    dispatcher.dispatch('entity.User.create', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((result) => {
      expect(result._id).to.exist();
      expect(result.firstName).to.equal('John');
      expect(result.lastName).to.equal('Doe');
    })
  ));

  it('should create an array of records', () => (
    dispatcher.dispatch('entity.User.create', [{
      firstName: 'John1',
      lastName: 'Doe1',
    }, {
      firstName: 'John2',
      lastName: 'Doe2',
    }, {
      firstName: 'John3',
      lastName: 'Doe3',
    }]).then((results) => {
      expect(results).to.have.lengthOf(3);
      expect(results[0].lastName).to.equal('Doe1');
      expect(results[1].firstName).to.equal('John2');
      expect(results[2]._id).to.exist();
    })
  ));

  it('should find an existing record by id', () => (
    dispatcher.dispatch('entity.User.create', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((createdUser) => {
      dispatcher.dispatch('entity.User.findById', createdUser._id)
        .then((foundUser) => {
          expect(foundUser._id).to.equal(createdUser._id);
          expect(foundUser.firstName).to.equal('John');
          expect(foundUser.lastName).to.equal('Doe');
        });
    })
  ));

  it('should find one record', () => (
    dispatcher.dispatch('entity.User.create', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((createdUser) => (
      dispatcher.dispatch('entity.User.findOne', {
        firstName: 'John',
      }).then((foundUser) => {
        expect(foundUser._id.toString()).to.equal(createdUser._id.toString());
        expect(foundUser.lastName).to.equal('Doe');
      })
    ))
  ));

  it('should find multiple records', () => (
    dispatcher.dispatch('entity.User.create', [{
      firstName: 'John1',
      lastName: 'Doe1',
    }, {
      firstName: 'John2',
      lastName: 'Doe2',
    }, {
      firstName: 'John3',
      lastName: 'Doe3',
    }]).then(() => (
      dispatcher.dispatch('entity.User.find').then((cursor) => (
        cursor.toArray().then((results) => {
          expect(results).to.have.lengthOf(3);
          expect(results[0].lastName).to.equal('Doe1');
          expect(results[1].firstName).to.equal('John2');
          expect(results[2]._id).to.exist();
        })
      ))
    ))
  ));

  it('should replace an existing record', () => (
    dispatcher.dispatch('entity.User.create', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((createdUser) => (
      dispatcher.dispatch('entity.User.replaceOne', Object.assign({}, createdUser, {
        lastName: 'Donovan',
      })).then((updatedUser) => {
        expect(updatedUser._id).to.equal(createdUser._id);
        expect(updatedUser.firstName).to.equal('John');
        expect(updatedUser.lastName).to.equal('Donovan');
      })
    ))
  ));

  it('should update a single record', () => (
    dispatcher.dispatch('entity.User.create', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((createdUser) => (
      dispatcher.dispatch('entity.User.updateOne', {
        filter: {
          _id: createdUser._id,
        },
        update: {
          $set: {
            lastName: 'Donovan',
          },
        },
      }).then(() => (
        dispatcher.dispatch('entity.User.findById', createdUser._id).then((updatedUser) => {
          expect(updatedUser._id.toString()).to.equal(createdUser._id.toString());
          expect(updatedUser.firstName).to.equal('John');
          expect(updatedUser.lastName).to.equal('Donovan');
        })
      ))
    ))
  ));

  it('should update multiple records', () => (
    dispatcher.dispatch('entity.User.create', [{
      firstName: 'John1',
      lastName: 'Doe1',
      role: 'admin',
    }, {
      firstName: 'John2',
      lastName: 'Doe2',
      role: 'superUser',
    }, {
      firstName: 'John3',
      lastName: 'Doe3',
      role: 'admin',
    }]).then(() => (
      dispatcher.dispatch('entity.User.updateMany', {
        filter: {
          role: 'admin',
        },
        update: {
          $set: {
            role: 'superAdmin',
          },
        },
      }).then(() => (
        dispatcher.dispatch('entity.User.find').then((cursor) => (
          cursor.toArray().then((users) => {
            const superAdmins = users.filter(({ role }) => role === 'superAdmin');
            const superUsers = users.filter(({ role }) => role === 'superUser');
            expect(superAdmins).to.have.lengthOf(2);
            expect(superUsers).to.have.lengthOf(1);
          })
        ))
      ))
    ))
  ));

  it('should remove an existing record', () => (
    dispatcher.dispatch('entity.User.create', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((createdUser) => (
      dispatcher.dispatch('entity.User.removeOne', createdUser._id).then(() => (
        dispatcher.dispatch('entity.User.findById', createdUser._id)
          .then((result) => {
            expect(result).to.be.null();
          })
      ))
    ))
  ));

  it('should create a simple index', () => (
    db.collection('User').listIndexes().toArray().then((indexes) => {
      const emailIndex = indexes.find(({ name }) => name === 'email');
      expect(emailIndex).to.exist();
      expect(emailIndex.key).to.deep.equal({
        email: 1,
      });
    })
  ));

  it('should create an index on multiple fields', () => (
    db.collection('User').listIndexes().toArray().then((indexes) => {
      const fullnameIndex = indexes.find(({ name }) => name === 'fullname');
      expect(fullnameIndex).to.exist();
      expect(fullnameIndex.key).to.deep.equal({
        firstName: 1,
        lastName: 1,
      });
    })
  ));
});
