import _ from 'lodash';
import Joi from 'joi';
import { expect } from 'chai'; // eslint-disable-line
import sinon from 'sinon'; // eslint-disable-line
import { MongoClient } from 'mongodb';
import { RefManager } from 'mongo-dnorm';
import { Plugin, Transport } from 'octobus.js';
import { generateCRUDServices, Store as OriginalStore, decorators } from '../src';

const Store = decorators.withTimestamps(OriginalStore);

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
  createdAt: Joi.date(),
  updatedAt: Joi.date(),
};

const categorySchema = {
  _id: Joi.object(),
  name: Joi.string().required(),
  productIds: Joi.array(),
  createdAt: Joi.date(),
  updatedAt: Joi.date(),
};

const productSchema = {
  _id: Joi.object(),
  name: Joi.string().required(),
  categoryId: Joi.object(),
  createdAt: Joi.date(),
  updatedAt: Joi.date(),
};

describe('generateCRUDServices', () => {
  let transport;
  let plugin;
  let db;

  before(() => (
    MongoClient.connect(`mongodb://localhost:27017/${databaseName}`).then((_db) => {
      db = _db;
    })
  ));

  beforeEach(() => {
    transport = new Transport();
    plugin = new Plugin();
    plugin.connect(transport);
    const refManager = new RefManager(db);

    plugin.subscribeTree('entity.User', generateCRUDServices('entity.User', {
      store: new Store({ db, collectionName: 'User', refManager }),
      schema: userSchema,
    }));

    plugin.subscribeTree('entity.Category', generateCRUDServices('entity.Category', {
      store: new Store({
        db,
        refManager,
        collectionName: 'Category',
        references: [{
          collectionName: 'Product',
          refProperty: 'productIds',
          type: 'many',
          ns: 'products',
          extractor: (product = {}) => ({ name: product.name }),
        }],
      }),
      schema: categorySchema,
    }));

    plugin.subscribeTree('entity.Product', generateCRUDServices('entity.Product', {
      store: new Store({
        db,
        refManager,
        collectionName: 'Product',
        references: [{
          collectionName: 'Category',
          refProperty: 'categoryId',
          type: 'one',
          ns: 'cache.category',
          extractor: (category = {}) => ({ name: category.name }),
        }],
      }),
      schema: productSchema,
    }));
  });

  afterEach(
    () => Promise.all(['User', 'Category', 'Product'].map(
      collectionName => db.collection(collectionName).remove(),
    )),
  );

  after(() => db.close());

  it('should create a new record', () => (
    plugin.send('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((result) => {
      expect(result._id).to.exist();
      expect(result.firstName).to.equal('John');
      expect(result.lastName).to.equal('Doe');
    })
  ));

  it('should create an array of records', () => (
    plugin.send('entity.User.createMany', [{
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
    plugin.send('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((createdUser) => {
      plugin.send('entity.User.findById', createdUser._id)
        .then((foundUser) => {
          expect(foundUser._id.toString()).to.equal(createdUser._id.toString());
          expect(foundUser.firstName).to.equal('John');
          expect(foundUser.lastName).to.equal('Doe');
        });
    })
  ));

  it('should return null when trying to find an unexisting record by id', () => (
    plugin.send('entity.User.findById', '__none__')
      .then(
        (result) => {
          expect(result).to.be.null();
        },
      )
  ));

  it('should find one record', () => (
    plugin.send('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    }).then(createdUser => (
      plugin.send('entity.User.findOne', {
        query: {
          firstName: 'John',
        },
      }).then((foundUser) => {
        expect(foundUser._id.toString()).to.equal(createdUser._id.toString());
        expect(foundUser.lastName).to.equal('Doe');
      })
    ))
  ));

  it('should find multiple records', () => (
    plugin.send('entity.User.createMany', [{
      firstName: 'John1',
      lastName: 'Doe1',
    }, {
      firstName: 'John2',
      lastName: 'Doe2',
    }, {
      firstName: 'John3',
      lastName: 'Doe3',
    }]).then(() => (
      plugin.send('entity.User.findMany').then(cursor => (
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
    plugin.send('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    }).then(createdUser => (
      plugin.send('entity.User.replaceOne', {
        ...createdUser,
        lastName: 'Donovan',
      }).then((updatedUser) => {
        expect(updatedUser._id).to.equal(createdUser._id);
        expect(updatedUser.firstName).to.equal('John');
        expect(updatedUser.lastName).to.equal('Donovan');
      })
    ))
  ));

  it('should update a single record', () => (
    plugin.send('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    }).then(createdUser => (
      plugin.send('entity.User.updateOne', {
        query: {
          _id: createdUser._id,
        },
        update: {
          $set: {
            lastName: 'Donovan',
          },
        },
      }).then(() => (
        plugin.send('entity.User.findById', createdUser._id).then((updatedUser) => {
          expect(updatedUser._id.toString()).to.equal(createdUser._id.toString());
          expect(updatedUser.firstName).to.equal('John');
          expect(updatedUser.lastName).to.equal('Donovan');
        })
      ))
    ))
  ));

  it('should update multiple records', () => (
    plugin.send('entity.User.createMany', [{
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
      plugin.send('entity.User.updateMany', {
        query: {
          role: 'admin',
        },
        update: {
          $set: {
            role: 'superAdmin',
          },
        },
      }).then(() => (
        plugin.send('entity.User.findMany').then(cursor => (
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
    plugin.send('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    }).then(createdUser => (
      plugin.send('entity.User.deleteOne', { query: { _id: createdUser._id } }).then(() => (
        plugin.send('entity.User.findById', createdUser._id)
          .then((result) => {
            expect(result).to.be.null();
          })
      ))
    ))
  ));

  it('should generate timestamps', () => {
    const now = Date.now();
    return plugin.send('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((createdUser) => {
      const { createdAt } = createdUser;

      expect(createdAt).to.exist();
      expect(createdAt).to.be.instanceof(Date);
      expect(createdAt.getTime()).to.be.at.least(now);

      return plugin.send('entity.User.replaceOne', Object.assign({}, createdUser, {
        lastName: 'Donovan',
      })).then((updatedUser) => {
        const { updatedAt } = updatedUser;
        expect(updatedAt.getTime()).to.be.at.least(createdAt.getTime());

        return plugin.send('entity.User.updateOne', {
          query: {
            _id: createdUser._id,
          },
          update: {
            $set: {
              firstName: 'Jonathan',
            },
          },
        }).then(() => (
          plugin.send('entity.User.findById', createdUser._id)
            .then(({ updatedAt: lastUpdateAt }) => {
              expect(lastUpdateAt.getTime()).to.be.at.least(updatedAt.getTime());
            })
        ));
      });
    });
  });

  describe('caching references', () => {
    it('should cache a single references', () => (
      plugin.send('entity.Category.createOne', {
        name: 'Laptops',
      }).then(category => (
        plugin.send('entity.Product.createOne', {
          name: 'MacBook Pro',
          categoryId: category._id,
        }).then(({ _id }) => (
          plugin.send('entity.Product.findOne', {
            query: { _id },
          }).then((product) => {
            expect(product.cache).to.exist();
            expect(product.cache.category).to.exist();
            expect(product.cache.category._id).to.not.exist();
            expect(product.cache.category.name).to.equal('Laptops');
          })
        ))
      ))
    ));

    it('should cache an array of references', () => (
      plugin.send('entity.Product.createMany',
        _.range(1, 5).map(id => ({
          name: `product${id}`,
        })),
      ).then(products => (
        plugin.send('entity.Category.createOne', {
          name: 'category1',
          productIds: products.map(({ _id }) => _id),
        }).then(({ _id }) => (
          plugin.send('entity.Category.findOne', {
            query: { _id },
          }).then((category) => {
            expect(category.products).to.exist();
            expect(Object.keys(category.products)).to.have.a.lengthOf(4);
          })
        ))
      ))
    ));

    it('should update the cache when the reference gets updated', () => (
      plugin.send('entity.Category.createOne', {
        name: 'Laptops',
      }).then(category => (
        plugin.send('entity.Product.createOne', {
          name: 'MacBook Pro',
          categoryId: category._id,
        }).then(({ _id }) => (
          plugin.send('entity.Category.replaceOne', {
            ...category,
            name: 'Apple Products',
          }).then(() => (
            plugin.send('entity.Product.findOne', {
              query: { _id },
            }).then((product) => {
              expect(product.cache.category).to.exist();
              expect(product.cache.category._id).to.not.exist();
              expect(product.cache.category.name).to.equal('Apple Products');
            })
          ))
        ))
      ))
    ));

    it('should cache update ref cache', () => (
      plugin.send('entity.Category.createOne', {
        name: 'Laptops',
      }).then(category => (
        plugin.send('entity.Product.createOne', {
          name: 'MacBook Pro',
          categoryId: category._id,
        }).then(({ _id }) => (
          plugin.send('entity.Category.updateOne', {
            query: {
              _id: category._id,
            },
            update: {
              $set: {
                name: 'Apple Products',
              },
            },
          }).then(() => (
            plugin.send('entity.Product.findOne', {
              query: { _id },
            }).then((product) => {
              expect(product.cache.category).to.exist();
              expect(product.cache.category._id).to.not.exist();
              expect(product.cache.category.name).to.equal('Apple Products');
            })
          ))
        ))
      ))
    ));
  });

  it('should count the records', () => (
    plugin.send('entity.User.createMany', [{
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
      plugin.send('entity.User.count', {
        query: {
          role: 'admin',
        },
      }).then((result) => {
        expect(result).to.equal(2);
      })
    ))
  ));
});
