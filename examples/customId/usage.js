import { MongoClient } from 'mongodb';
import Octobus from 'octobus.js';
import Joi from 'joi';
import { generateCRUDServices } from '../../src';
import Store from './Store';

const dispatcher = new Octobus();

MongoClient.connect('mongodb://localhost:27017/customId').then((db) => {
  let counter = 0;
  const idGenerator = () => {
    counter += 1;
    return counter;
  };

  dispatcher.subscribeMap('entity.Item', generateCRUDServices(dispatcher, 'entity.Item', {
    db,
    schema: {
      _id: Joi.object(),
      name: Joi.string().required(),
      createdAt: Joi.date(),
      updatedAt: Joi.date(),
    },
    store: new Store(
      db.collection('Item'),
      'id',
      idGenerator,
    ),
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
