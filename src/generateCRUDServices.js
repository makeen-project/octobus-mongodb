import _ from 'lodash';
import Joi from 'joi';
import { ObjectID as objectId } from 'mongodb';

const paramsToCursor = (collection, params = {}) => {
  const { query, fields, orderBy, limit, skip } = Object.assign({
    query: {},
    fields: {},
  }, params);

  let cursor = collection.find(query, fields);

  if (orderBy) {
    cursor = cursor.sort(orderBy);
  }

  if (skip) {
    cursor = cursor.skip(skip);
  }

  if (limit) {
    cursor = cursor.limit(limit);
  }

  return cursor;
};

const extractCollectionName = (namespace) => {
  const lastIndex = namespace.lastIndexOf('.');
  return lastIndex > -1 && namespace.substr(lastIndex + 1);
};

const processIndex = (index) => {
  if (typeof index === 'string') {
    return {
      fields: {
        [index]: 1,
      },
    };
  }

  if (Array.isArray(index)) {
    return {
      fields: index.reduce((acc, field) => ({ ...acc, [field]: 1 }), {}),
    };
  }

  return index;
};

const createIndexesIfNotExist = (db, collectionName, indexes) => (
  Promise.all(Object.keys(indexes).map((indexName) => {
    const { fields, options } = processIndex(indexes[indexName]);
    return db.collection(collectionName).createIndex(fields, { ...options, name: indexName });
  }))
);

const createCollectionIfNotExists = (db, collectionName) => (
  db.collections().then((collections) => (
    !collections.includes(collectionName) && db.createCollection(collectionName)
  ))
);

const createCollection = (db, collectionName, indexes) => (
  createCollectionIfNotExists(db, collectionName)
    .then(() => createIndexesIfNotExist(db, collectionName, indexes))
);

export default (namespace, _options = {}) => {
  const options = Joi.attempt(_options, {
    collectionName: Joi.string().default(extractCollectionName(namespace)),
    indexes: Joi.object().default({}),
    db: Joi.required(),
    schema: Joi.object(),
    autoCreateCollection: Joi.boolean().default(true),
  });

  const { collectionName, indexes, db, schema, autoCreateCollection } = options;
  const getCollection = () => db.collection(collectionName);

  const map = {
    query({ params }) {
      return params(getCollection(), db);
    },

    find({ params }) {
      return paramsToCursor(getCollection(), params);
    },

    findOne({ params }) {
      return doFindOne(params);
    },

    findById({ params }) {
      return doFindOne({ _id: params });
    },

    create({ dispatch, params }) {
      return dispatch(`${namespace}.save`, params);
    },

    updateOne({ params }) {
      return doUpdate(params);
    },

    updateMany({ params }) {
      return doUpdate(params, false);
    },

    replaceOne({ dispatch, params }) {
      if (!params._id) {
        throw new Error('You have to provide an id along with the update payload!');
      }

      return dispatch(`${namespace}.save`, params);
    },

    save({ params, dispatch, emitBefore, emitAfter }) {
      return dispatch(`${namespace}.validate`, params)
        .then((data) => {
          emitBefore(`${namespace}.save`, data);
          return doSave(data);
        })
        .then((result) => {
          emitAfter(`${namespace}.save`, result);
          return result;
        });
    },

    removeOne({ params }) {
      return doRemove(params);
    },

    removeMany({ params }) {
      return doRemove(params, false);
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

  const doFindOne = (params) => {
    const collection = getCollection();

    const { query, options: queryOptions } = Object.assign({
      query: {},
      options: {},
    }, params);

    return collection.findOne(query, queryOptions);
  };

  const doInsert = (data) => (
    Array.isArray(data) ?
      getCollection().insertMany(data).then((result) => result.ops) :
      getCollection().insertOne(data).then((result) => result.ops[0])
  );

  const doReplace = (_id, data) => getCollection().replaceOne({ _id }, data)
    .then((result) => ({ _id, ...result.ops[0] }));

  const doSave = (data) => (data._id ? doReplace(data._id, _.omit(data, '_id')) : doInsert(data));

  const doRemove = (params, one = true) => {
    if (params instanceof objectId) {
      return getCollection().deleteOne({ _id: params });
    }

    const { filter, options: filterOptions } = Object.assign({
      filter: {},
      options: {},
    }, params);

    const method = one ? 'deleteOne' : 'deleteMany';

    return getCollection()[method](filter, filterOptions);
  };

  const doUpdate = (params, one = true) => {
    const { filter, update, options: updateOptions } = Object.assign({
      filter: {},
      options: {},
    }, params);

    const method = one ? 'updateOne' : 'updateMany';

    return getCollection()[method](filter, update, updateOptions);
  };

  return Promise.resolve(autoCreateCollection && createCollection(db, collectionName, indexes))
    .then(() => ({ namespace, map }));
};
