import Joi from 'joi';
import { decorators } from 'octobus.js';
import { ObjectID } from 'mongodb';
import {
  extractCollectionName,
  addTimestamps,
  addTimestampToUpdate,
} from './utils';
import Store from './Store';

const { withSchema } = decorators;

export default (dispatcher, namespace, options = {}) => {
  const parsedOptions = Joi.attempt(options, {
    collectionName: Joi.string().default(extractCollectionName(namespace)),
    store: Joi.object().type(Store),
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
      collectionName: Joi.string().required(),
      refProperty: Joi.string(),
      type: Joi.string().valid(['one', 'many']).default('one'),
      ns: Joi.string(),
      extractor: Joi.func().default(item => item),
      syncOn: Joi.array().items(Joi.string().valid(['update', 'remove'])
        .default(['update', 'remove'])),
    })).default([]),
    refManager: Joi.object(),
  });

  const { collectionName, db, schema, references, timestamps, refManager } = parsedOptions;

  const store = parsedOptions.store || new Proxy(new Store(db.collection(collectionName)), {
    get(target, method) {
      return method in target ? target[method] : target.getCollection()[method];
    },
  });

  const hasReferences = Array.isArray(references) && references.length;

  if (hasReferences) {
    references.forEach((reference) => {
      const { collectionName: destination, ...restConfig } = reference;
      refManager.add({
        source: collectionName,
        destination,
        ...restConfig,
      });
    });
  }

  const map = {
    query: withSchema(Joi.func().required())(
      ({ params: cb }) => cb(store, db),
    ),

    findById: withSchema(Joi.any().required())(
      ({ params: _id }) => store.findById(_id),
    ),

    findOne: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      }),
    )(
      ({ params = {} }) => store.findOne(params),
    ),

    findMany: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        orderBy: Joi.any(),
        limit: Joi.number(),
        skip: Joi.number(),
        fields: Joi.any(),
      }),
    )(
      ({ params = {} }) => store.findMany(params),
    ),

    createOne({ dispatch, params }) {
      return dispatch(`${namespace}.save`, params);
    },

    createMany: withSchema(
      Joi.array().min(1).required(),
    )(
      ({ dispatch, params }) => Promise.all(
        params.map(item => dispatch(`${namespace}.save`, item)),
      ),
    ),

    updateOne: withSchema(
      Joi.object().keys({
        update: Joi.object().required(),
      }).unknown(true).required(),
    )(
      async ({ params }) => {
        const result = await store.updateOne({
          ...params,
          update: addTimestampToUpdate(params.update, timestamps),
        });

        if (hasReferences) {
          await refManager.notifyUpdate(collectionName, params.query);
        }

        return result;
      },
    ),

    updateMany: withSchema(
      Joi.object().keys({
        update: Joi.object().required(),
      }).unknown(true).required(),
    )(
      async ({ params }) => {
        const result = store.updateMany({
          ...params,
          update: addTimestampToUpdate(params.update, timestamps),
        });

        if (hasReferences) {
          await refManager.notifyUpdate(collectionName, params.query);
        }

        return result;
      },
    ),

    replaceOne: withSchema(
      Joi.object().keys({
        _id: Joi.any().required(),
      }).unknown(true).required(),
    )(
      ({ dispatch, params }) => dispatch(`${namespace}.save`, params),
    ),

    syncReferences: ({ params }) => (
      refManager.sync({
        collection: collectionName,
        data: params,
        runBulkOperation: false,
      })
    ),

    async save({ params, dispatch }) {
      const data = await dispatch(`${namespace}.validate`, params);

      if (timestamps.generate) {
        addTimestamps(data, timestamps);
      }

      if (hasReferences) {
        await dispatch(`${namespace}.syncReferences`, data);
      }

      const result = await store.save(data);

      if (hasReferences && data._id) {
        await refManager.notifyUpdate(collectionName, {
          _id: data._id,
        });
      }

      return result;
    },

    deleteOne: withSchema(
      Joi.alternatives().try(
        Joi.object().type(ObjectID),
        Joi.object().keys({
          query: Joi.object(),
          options: Joi.object(),
        }),
      ),
    )(
      async ({ params }) => {
        if (hasReferences) { // has to be called first
          await refManager.notifyRemove(collectionName, params.query);
        }

        return store.deleteOne(params);
      },
    ),

    deleteMany: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      }),
    )(
      async ({ params }) => {
        if (hasReferences) { // has to be called first
          await refManager.notifyRemove(collectionName, params.query);
        }

        return store.deleteMany(params);
      },
    ),

    count: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      }),
    )(
      ({ params }) => store.count(params),
    ),

    aggregate({ params }) {
      return store.aggregate(params);
    },

    validate({ params }) {
      if (!schema) {
        return params;
      }

      return Joi.attempt(params, schema, {
        convert: true,
        stripUnknown: true,
      });
    },
  };

  return map;
};
