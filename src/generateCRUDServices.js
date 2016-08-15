import Joi from 'joi';
import { set } from 'lodash';
import { doFindOne, doSave, doRemove, doUpdate, doCount, doAggregate } from './db';
import {
  paramsToCursor,
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

export default (dispatcher, namespace, _options = {}) => {
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
      cache: Joi.object().keys({
        under: Joi.string().required(),
        properties: [
          Joi.array().items(Joi.string()),
        ],
      }).default({}),
    })).default([]),
  });

  const { collectionName, db, schema, references } = options;
  const getCollection = () => db.collection(collectionName);

  const shouldCacheReferences = hasRefCachePointers(options.references);

  addReplaceListener({
    dispatcher,
    references,
    namespace,
  });

  const map = {
    query({ params }) {
      return params(getCollection(), db);
    },

    findById({ params }) {
      const _id = params;
      return doFindOne(getCollection(), { query: { _id } });
    },

    findOne({ params, dispatch }) {
      return doFindOne(getCollection(), params).then((result) => (
        expand(dispatch, result, params.expand, references)
      ));
    },

    findMany({ params, dispatch }) {
      const cursor = paramsToCursor(getCollection(), params);

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

      if (shouldCacheReferences && shouldGenerateRefCache(data, references)) {
        const refCache = await generateRefCache({ dispatch, references, data });
        Object.keys(refCache).forEach((key) => {
          set(data, key, refCache[key]);
        });
      }

      return await doSave(getCollection(), data);
    },

    removeOne({ params }) {
      return doRemove(getCollection(), params);
    },

    removeMany({ params }) {
      return doRemove(getCollection(), params, false);
    },

    count({ params }) {
      return doCount(getCollection(), params);
    },

    aggregate({ params }) {
      return doAggregate(getCollection(), params);
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

      const cursor = await getCollection().find(query);
      const items = await cursor.toArray();

      return updateRefCache({
        dispatch,
        items,
        references: selectedReferences,
        collection: getCollection(),
      });
    },
  };

  return map;
};
