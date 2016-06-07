import { ObjectID as objectId } from 'mongodb';
import _ from 'lodash';

export const doFindOne = (collection, params) => {
  const { query, options: queryOptions } = {
    query: {},
    options: {},
    ...params,
  };

  return collection.findOne(query, queryOptions);
};

export const doInsert = (collection, data) => (
  Array.isArray(data) ?
    collection.insertMany(data).then((result) => result.ops) :
    collection.insertOne(data).then((result) => result.ops[0])
);

export const doReplace = (collection, _id, data) => (
  collection.replaceOne({ _id }, data).then((result) => ({ _id, ...result.ops[0] }))
);

export const doSave = (collection, data) => (
  data._id ? doReplace(collection, data._id, _.omit(data, '_id')) :
  doInsert(collection, data)
);

export const doRemove = (collection, params, one = true) => {
  if (params instanceof objectId) {
    return collection.deleteOne({ _id: params });
  }

  const { filter, options: filterOptions } = {
    filter: {},
    options: {},
    ...params,
  };

  const method = one ? 'deleteOne' : 'deleteMany';

  return collection[method](filter, filterOptions);
};

export const doUpdate = (collection, params, one = true) => {
  const { filter, update, options: updateOptions } = {
    filter: {},
    options: {},
    ...params,
  };

  const method = one ? 'updateOne' : 'updateMany';

  return collection[method](filter, update, updateOptions);
};
