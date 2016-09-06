import Joi from 'joi';
import { set } from 'lodash';
import {
  extractCollectionName,
  addTimestamps,
  addTimestampToUpdate,
  expand,
} from './utils';
import {
  hasRefCachePointers,
  generateRefCache,
  updateRefCache,
  addReplaceListener,
  shouldGenerateRefCache,
} from './refCache';
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
      refId: Joi.any().required(),
      refEntity: Joi.string().required(),
      cache: Joi.object().keys({
        under: Joi.string().required(),
        properties: [
          Joi.array().items(Joi.string()),
        ],
      }).default({}),
    })).default([]),
  });

  const { collectionName, db, schema, references, timestamps } = parsedOptions;

  const store = parsedOptions.store || new Proxy(new Store(db.collection(collectionName)), {
    get(target, method) {
      return method in target ? target[method] : target.getCollection()[method];
    },
  });

  const shouldCacheReferences = hasRefCachePointers(references);

  addReplaceListener({
    dispatcher,
    references,
    namespace,
  });

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
      ({ params = {}, dispatch }) => (
        store.findOne(params).then((result) => (
          expand(dispatch, result, params.expand, references)
        ))
      ),
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
        expand: Joi.array(),
      })
    ),

    findMany: withSchema(
      ({ params = {}, dispatch }) => {
        const cursor = store.findMany(params);

        if (!params || !params.expand) {
          return cursor;
        }

        return cursor.toArray().then((result) => (
          expand(dispatch, result, params.expand, references)
        ));
      },
      Joi.object().keys({
        query: Joi.object(),
        orderBy: Joi.any(),
        limit: Joi.number(),
        skip: Joi.number(),
        fields: Joi.any(),
        expand: Joi.array(),
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
      ({ params }) => (
        store.updateOne({
          ...params,
          update: addTimestampToUpdate(params.update, timestamps),
        })
      ),
      Joi.object().keys({
        update: Joi.object().required(),
      }).unknown(true).required(),
    ),

    updateMany: withSchema(
      ({ params }) => (
        store.updateMany({
          ...params,
          update: addTimestampToUpdate(params.update, timestamps),
        })
      ),
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

    async save({ params, dispatch }) {
      const data = await dispatch(`${namespace}.validate`, params);

      if (timestamps.generate) {
        addTimestamps(data, timestamps);
      }

      if (shouldCacheReferences && shouldGenerateRefCache(data, references)) {
        const refCache = await generateRefCache({ dispatch, references, data });
        Object.keys(refCache).forEach((key) => {
          set(data, key, refCache[key]);
        });
      }

      return await store.save(data);
    },

    deleteOne: withSchema(
      ({ params }) => store.deleteOne(params),
      Joi.alternatives().try(
        Joi.object().type(ObjectID),
        Joi.object().keys({
          query: Joi.object(),
          options: Joi.object(),
        })
      )
    ),

    deleteMany: withSchema(
      ({ params }) => store.deleteMany(params),
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

    async updateRefCache({ params, dispatch }) {
      const { query, entities } = {
        query: {},
        entities: [],
        ...params,
      };

      let selectedReferences = references;

      if (entities.length) {
        selectedReferences = references.filter(({ refEntity }) => entities.includes(refEntity));
      }

      const cursor = await store.getCollection().find(query);
      const items = await cursor.toArray();

      return updateRefCache({
        dispatch,
        items,
        references: selectedReferences,
        collection: store.getCollection(),
      });
    },
  };

  return map;
};
