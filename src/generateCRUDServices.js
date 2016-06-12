import Joi from 'joi';
import { doFindOne, doSave, doRemove, doUpdate } from './db';
import {
  paramsToCursor, extractCollectionName, addTimestamps, addTimestampToUpdate,
} from './utils';

export default (namespace, _options = {}) => {
  const options = Joi.attempt(_options, {
    collectionName: Joi.string().default(extractCollectionName(namespace)),
    db: Joi.required(),
    schema: Joi.object(),
    timestamps: Joi.object().keys({
      generate: Joi.boolean().required(),
      createKey: Joi.string().required(),
      updateKey: Joi.string().required(),
    }).default({
      generate: true,
      createKey: 'createdAt',
      updateKey: 'updatedAt',
    }),
    references: Joi.array().items(Joi.object().keys({
      refId: Joi.any().required(),
      refEntity: Joi.string().required(),
    })).default([]),
  });

  const { collectionName, db, schema } = options;
  const getCollection = () => db.collection(collectionName);

  const expandReferences = (refs, result) => {
    throw new Error('Not implemented');
  };

  const map = {
    query({ params }) {
      return params(getCollection(), db);
    },

    find({ params }) {
      return paramsToCursor(getCollection(), params);
    },

    findOne({ params }) {
      return expandReferences(doFindOne(getCollection(), params));
    },

    findById({ params }) {
      return doFindOne(getCollection(), { _id: params });
    },

    create({ dispatch, params }) {
      return dispatch(`${namespace}.save`, params);
    },

    updateOne({ params }) {
      return doUpdate(getCollection(), {
        ...params,
        update: addTimestampToUpdate(params.update, options.timestamps),
      });
    },

    updateMany({ params }) {
      return doUpdate(getCollection(), {
        ...params,
        update: addTimestampToUpdate(params.update, options.timestamps),
      }, false);
    },

    replaceOne({ dispatch, params }) {
      if (!params._id) {
        throw new Error('You have to provide an id along with the update payload!');
      }

      return dispatch(`${namespace}.save`, params);
    },

    async save({ params, dispatch }) {
      const data = await dispatch(`${namespace}.validate`, params);

      if (options.timestamps.generate) {
        addTimestamps(data, options.timestamps);
      }

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
