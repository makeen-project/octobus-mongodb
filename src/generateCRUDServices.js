import Joi from 'joi';
import {
  extractCollectionName,
  addTimestamps,
  addTimestampToUpdate,
} from './utils';
import Store from './Store';
import { decorators } from 'octobus.js';
import { ObjectID } from 'mongodb';

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
      extractor: Joi.func().default((item) => item),
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
    query: withSchema(
      ({ params: cb }) => cb(store, db),
      Joi.func().required(),
    ),

    findById: withSchema(
      ({ params: _id }) => store.findById(_id),
      Joi.any().required(),
    ),

    findOne: withSchema(
      ({ params = {} }) => store.findOne(params),
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      })
    ),

    findMany: withSchema(
      ({ params = {} }) => store.findMany(params),
      Joi.object().keys({
        query: Joi.object(),
        orderBy: Joi.any(),
        limit: Joi.number(),
        skip: Joi.number(),
        fields: Joi.any(),
      })
    ),

    createOne({ dispatch, params }) {
      return dispatch(`${namespace}.save`, params);
    },

    createMany: withSchema(
      ({ dispatch, params }) => Promise.all(
        params.map((item) => dispatch(`${namespace}.save`, item))
      ),
      Joi.array().min(1).required()
    ),

    updateOne: withSchema(
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
      Joi.object().keys({
        update: Joi.object().required(),
      }).unknown(true).required(),
    ),

    updateMany: withSchema(
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
      Joi.object().keys({
        update: Joi.object().required(),
      }).unknown(true).required(),
    ),

    replaceOne: withSchema(
      ({ dispatch, params }) => dispatch(`${namespace}.save`, params),
      Joi.object().keys({
        _id: Joi.any().required(),
      }).unknown(true).required(),
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
      async ({ params }) => {
        const result = await store.deleteOne(params);

        if (hasReferences) {
          await refManager.notifyRemove(collectionName, params.query);
        }

        return result;
      },
      Joi.alternatives().try(
        Joi.object().type(ObjectID),
        Joi.object().keys({
          query: Joi.object(),
          options: Joi.object(),
        })
      )
    ),

    deleteMany: withSchema(
      async ({ params }) => {
        const result = await store.deleteMany(params);

        if (hasReferences) {
          await refManager.notifyRemove(collectionName, params.query);
        }

        return result;
      },
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      })
    ),

    count: withSchema(
      ({ params }) => store.count(params),
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      })
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
