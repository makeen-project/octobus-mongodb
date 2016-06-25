import _ from 'lodash';
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
  let dispatcher;
  let db;

  before(() => (
    MongoClient.connect(`mongodb://localhost:27017/${databaseName}`).then((_db) => {
      db = _db;
    })
  ));

  beforeEach(() => {
    dispatcher = createEventDispatcher();

    dispatcher.subscribeMap('entity.User', generateCRUDServices(dispatcher, 'entity.User', {
      db,
      schema: userSchema,
      collectionName: 'User',
    }));

    dispatcher.subscribeMap('entity.Category', generateCRUDServices(dispatcher, 'entity.Category', {
      db,
      schema: categorySchema,
      collectionName: 'Category',
      references: [{
        refId: 'productIds',
        refEntity: 'Product',
        cache: {
          under: 'products',
          properties: ['name'],
        },
      }],
    }));

    dispatcher.subscribeMap('entity.Product', generateCRUDServices(dispatcher, 'entity.Product', {
      db,
      schema: productSchema,
      collectionName: 'Product',
      references: [{
        refId: 'categoryId',
        refEntity: 'Category',
        cache: {
          under: 'category',
          properties: ['name'],
        },
      }],
    }));
  });

  afterEach(
    () => Promise.all(['User', 'Category', 'Product'].map(
      (collectionName) => db.collection(collectionName).remove()
    ))
  );

  after(() => db.close());

  it('should call the create hooks', () => {
    const before = sinon.spy();
    const after = sinon.spy();
    dispatcher.onBefore('entity.User.createOne', before);
    dispatcher.onAfter('entity.User.createOne', after);
    return dispatcher.dispatch('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    }).then(() => {
      expect(before).to.have.been.calledOnce();
      expect(after).to.have.been.calledOnce();
    });
  });

  it('should create a new record', () => (
    dispatcher.dispatch('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((result) => {
      expect(result._id).to.exist();
      expect(result.firstName).to.equal('John');
      expect(result.lastName).to.equal('Doe');
    })
  ));

  it('should create an array of records', () => (
    dispatcher.dispatch('entity.User.createMany', [{
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
    dispatcher.dispatch('entity.User.createOne', {
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

  it('should return null when trying to find an unexisting record by id', () => (
    dispatcher.dispatch('entity.User.findById', '__none__')
      .then(
        (result) => {
          expect(result).to.be.null();
        }
      )
  ));

  it('should find one record', () => (
    dispatcher.dispatch('entity.User.createOne', {
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
    dispatcher.dispatch('entity.User.createMany', [{
      firstName: 'John1',
      lastName: 'Doe1',
    }, {
      firstName: 'John2',
      lastName: 'Doe2',
    }, {
      firstName: 'John3',
      lastName: 'Doe3',
    }]).then(() => (
      dispatcher.dispatch('entity.User.findMany').then((cursor) => (
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
    dispatcher.dispatch('entity.User.createOne', {
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
    dispatcher.dispatch('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((createdUser) => (
      dispatcher.dispatch('entity.User.updateOne', {
        query: {
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
    dispatcher.dispatch('entity.User.createMany', [{
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
        query: {
          role: 'admin',
        },
        update: {
          $set: {
            role: 'superAdmin',
          },
        },
      }).then(() => (
        dispatcher.dispatch('entity.User.findMany').then((cursor) => (
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
    dispatcher.dispatch('entity.User.createOne', {
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

  it('should execute before and after save events', () => {
    const before = sinon.spy();
    const after = sinon.spy();

    dispatcher.onBefore('entity.User.save', before);
    dispatcher.onAfter('entity.User.save', after);

    const promise = dispatcher.dispatch('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    });

    expect(before).to.have.been.calledOnce();

    return promise.then(() => {
      expect(after).to.have.been.calledOnce();
    });
  });

  it('should generate timestamps', () => {
    const now = Date.now();
    return dispatcher.dispatch('entity.User.createOne', {
      firstName: 'John',
      lastName: 'Doe',
    }).then((createdUser) => {
      const { createdAt } = createdUser;

      expect(createdAt).to.exist();
      expect(createdAt).to.be.instanceof(Date);
      expect(createdAt.getTime()).to.be.above(now);

      return dispatcher.dispatch('entity.User.replaceOne', Object.assign({}, createdUser, {
        lastName: 'Donovan',
      })).then((updatedUser) => {
        const { updatedAt } = updatedUser;
        expect(updatedAt.getTime()).to.be.above(createdAt.getTime());

        return dispatcher.dispatch('entity.User.updateOne', {
          query: {
            _id: createdUser._id,
          },
          update: {
            $set: {
              firstName: 'Jonathan',
            },
          },
        }).then(() => (
          dispatcher.dispatch('entity.User.findById', createdUser._id)
            .then(({ updatedAt: lastUpdateAt }) => {
              expect(lastUpdateAt.getTime()).to.be.above(updatedAt.getTime());
            })
        ));
      });
    });
  });

  describe('expanding references', () => {
    it('should expand a single reference', () => (
      dispatcher.dispatch('entity.Category.createOne', {
        name: 'Laptops',
      }).then((category) => (
        dispatcher.dispatch('entity.Product.createOne', {
          name: 'MacBook Pro',
          categoryId: category._id,
        }).then(({ _id }) => (
          dispatcher.dispatch('entity.Product.findOne', {
            query: { _id },
            expand: [{
              refId: 'categoryId',
              as: 'category',
            }],
          }).then((product) => {
            expect(product.category).to.exist();
            expect(product.category.name).to.equal('Laptops');
          })
        ))
      ))
    ));

    it('should expand an array of references', () => (
      dispatcher.dispatch('entity.Product.createMany',
        _.range(1, 5).map((id) => ({
          name: `product${id}`,
        }))
      ).then((products) => (
        dispatcher.dispatch('entity.Category.createOne', {
          name: 'category1',
          productIds: products.map(({ _id }) => _id),
        }).then(({ _id }) => (
          dispatcher.dispatch('entity.Category.findOne', {
            query: { _id },
            expand: [{
              refId: 'productIds',
              as: 'products',
            }],
          }).then((category) => {
            expect(category.products).to.exist();
            expect(category.products).to.have.a.lengthOf(4);
          })
        ))
      ))
    ));
  });

  describe('caching references', () => {
    it('should cache a single references', () => (
      dispatcher.dispatch('entity.Category.createOne', {
        name: 'Laptops',
      }).then((category) => (
        dispatcher.dispatch('entity.Product.createOne', {
          name: 'MacBook Pro',
          categoryId: category._id,
        }).then(({ _id }) => (
          dispatcher.dispatch('entity.Product.findOne', {
            query: { _id },
          }).then((product) => {
            expect(product.category).to.exist();
            expect(product.category._id).to.not.exist();
            expect(product.category.name).to.equal('Laptops');
          })
        ))
      ))
    ));

    it('should cache an array of references', () => (
      dispatcher.dispatch('entity.Product.createMany',
        _.range(1, 5).map((id) => ({
          name: `product${id}`,
        }))
      ).then((products) => (
        dispatcher.dispatch('entity.Category.createOne', {
          name: 'category1',
          productIds: products.map(({ _id }) => _id),
        }).then(({ _id }) => (
          dispatcher.dispatch('entity.Category.findOne', {
            query: { _id },
          }).then((category) => {
            expect(category.products).to.exist();
            expect(category.products).to.have.a.lengthOf(4);
          })
        ))
      ))
    ));

    it('should update the cache when the reference gets updated', () => (
      dispatcher.dispatch('entity.Category.createOne', {
        name: 'Laptops',
      }).then((category) => (
        dispatcher.dispatch('entity.Product.createOne', {
          name: 'MacBook Pro',
          categoryId: category._id,
        }).then(({ _id }) => (
          dispatcher.dispatch('entity.Category.replaceOne', {
            ...category,
            name: 'Apple Products',
          }).then(() => (
            dispatcher.dispatch('entity.Product.findOne', {
              query: { _id },
            }).then((product) => {
              expect(product.category).to.exist();
              expect(product.category._id).to.not.exist();
              expect(product.category.name).to.equal('Apple Products');
            })
          ))
        ))
      ))
    ));

    it('should cache update ref cache', () => (
      dispatcher.dispatch('entity.Category.createOne', {
        name: 'Laptops',
      }).then((category) => (
        dispatcher.dispatch('entity.Product.createOne', {
          name: 'MacBook Pro',
          categoryId: category._id,
        }).then(({ _id }) => (
          dispatcher.dispatch('entity.Category.updateOne', {
            query: {
              _id: category._id,
            },
            update: {
              $set: {
                name: 'Apple Products',
              },
            },
          }).then(() => (
            dispatcher.dispatch('entity.Product.updateRefCache', () => (
              dispatcher.dispatch('entity.Product.findOne', {
                query: { _id },
              }).then((product) => {
                expect(product.category).to.exist();
                expect(product.category._id).to.not.exist();
                expect(product.category.name).to.equal('Apple Products');
              })
            ))
          ))
        ))
      ))
    ));
  });

  it('should count the records', () => (
    dispatcher.dispatch('entity.User.createMany', [{
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
      dispatcher.dispatch('entity.User.count', {
        query: {
          role: 'admin',
        },
      }).then((result) => {
        expect(result).to.equal(2);
      })
    ))
  ));
});
