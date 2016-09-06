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
    query({ params: cb }) {
      return cb(store, db);
    },

    findById({ params: _id }) {
      return store.findById(_id);
    },

    findOne({ params, dispatch }) {
      return store.findOne(params).then((result) => (
        expand(dispatch, result, params.expand, references)
      ));
    },

    findMany({ params = {}, dispatch }) {
      const cursor = store.findMany(params);

      if (!params || !params.expand) {
        return cursor;
      }

      return cursor.toArray().then((result) => (
        expand(dispatch, result, params.expand, references)
      ));
    },

    createOne({ dispatch, params }) {
      return dispatch(`${namespace}.save`, params);
    },

    createMany({ dispatch, params }) {
      return Promise.all(
        params.map((item) => dispatch(`${namespace}.save`, item))
      );
    },

    updateOne({ params }) {
      return store.updateOne({
        ...params,
        update: addTimestampToUpdate(params.update, timestamps),
      });
    },

    updateMany({ params }) {
      return store.updateMany({
        ...params,
        update: addTimestampToUpdate(params.update, timestamps),
      });
    },

    replaceOne({ dispatch, params }) {
      if (!params._id) {
        throw new Error('You have to provide an id along with the update payload!');
      }

      return dispatch(`${namespace}.save`, params);
    },

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

    removeOne({ params }) {
      return store.deleteOne(params);
    },

    removeMany({ params }) {
      return store.deleteMany(params);
    },

    count({ params }) {
      return store.count(params);
    },

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
