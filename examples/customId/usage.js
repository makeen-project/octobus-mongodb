import { MongoClient } from 'mongodb';
import Octobus from 'octobus.js';
import Joi from 'joi';
import { generateCRUDServices, Store as OriginalStore, decorators } from '../../src';

const { withCustomId, withTimestamps } = decorators;

const Store = withTimestamps(withCustomId(OriginalStore));

const dispatcher = new Octobus();

MongoClient.connect('mongodb://localhost:27017/customId').then((db) => {
  let counter = 0;
  const idGenerator = () => {
    counter += 1;
    return counter;
  };

  dispatcher.subscribeMap('entity.Item', generateCRUDServices('entity.Item', {
    store: new Store({
      db,
      collectionName: 'Item',
      id: {
        key: 'id',
        generator: idGenerator,
      },
    }),
    schema: {
      _id: Joi.object(),
      name: Joi.string().required(),
      createdAt: Joi.date(),
      updatedAt: Joi.date(),
    },
  }));

  dispatcher.dispatch('entity.Item.createMany', [{
    name: 'works1',
  }, {
    name: 'works2',
  }, {
    name: 'works3',
  }]).then(() => {
    dispatcher.dispatch('entity.Item.findById', 2).then((item) => {
      console.log(item);
    });
  });
});
