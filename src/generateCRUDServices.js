import Joi from 'joi';
import { doFindOne, doSave, doRemove, doUpdate } from './db';
import { paramsToCursor, extractCollectionName } from './utils';

export default (namespace, _options = {}) => {
  const options = Joi.attempt(_options, {
    collectionName: Joi.string().default(extractCollectionName(namespace)),
    db: Joi.required(),
    schema: Joi.object(),
  });

  const { collectionName, db, schema } = options;
  const getCollection = () => db.collection(collectionName);

  const map = {
    query({ params }) {
      return params(getCollection(), db);
    },

    find({ params }) {
      return paramsToCursor(getCollection(), params);
    },

    findOne({ params }) {
      return doFindOne(getCollection(), params);
    },

    findById({ params }) {
      return doFindOne(getCollection(), { _id: params });
    },

    create({ dispatch, params }) {
      return dispatch(`${namespace}.save`, params);
    },

    updateOne({ params }) {
      return doUpdate(getCollection(), params);
    },

    updateMany({ params }) {
      return doUpdate(getCollection(), params, false);
    },

    replaceOne({ dispatch, params }) {
      if (!params._id) {
        throw new Error('You have to provide an id along with the update payload!');
      }

      return dispatch(`${namespace}.save`, params);
    },

    async save({ params, dispatch }) {
      const data = await dispatch(`${namespace}.validate`, params);
      return await doSave(getCollection(), data);
    },

    removeOne({ params }) {
      return doRemove(getCollection(), params);
    },

    removeMany({ params }) {
      return doRemove(getCollection(), params, false);
    },

    validate({ params }) {
      if (!schema) {
        return params;
      }

      if (Array.isArray(params)) {
        return params.map((item) => map.validate({ params: item }));
      }

      return Joi.attempt(params, schema, {
        convert: true,
        stripUnknown: true,
      });
    },
  };

  return map;
};
