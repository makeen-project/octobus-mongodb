import { ObjectID as objectId } from 'mongodb';
import _ from 'lodash';

export const findOne = (collection, params) => {
  const { query, options: queryOptions } = {
    query: {},
    options: {},
    ...params,
  };

  return collection.findOne(query, queryOptions);
};

export const insert = (collection, data) => (
  Array.isArray(data) ?
    collection.insertMany(data).then((result) => result.ops) :
    collection.insertOne(data).then((result) => result.ops[0])
);

export const doReplace = (collection, _id, data) => (
  collection.replaceOne({ _id }, data).then((result) => ({ _id, ...result.ops[0] }))
);

export const save = (collection, data) => (
  data._id ? doReplace(collection, data._id, _.omit(data, '_id')) :
  insert(collection, data)
);

export const deleteMany = (collection, params) => {
  const { query, options: filterOptions } = {
    query: {},
    options: {},
    ...params,
  };

  return collection.deleteMany(query, filterOptions);
};

export const deleteOne = (collection, params) => {
  if (params instanceof objectId) {
    return collection.deleteOne({ _id: params });
  }

  const { query, options: filterOptions } = {
    query: {},
    options: {},
    ...params,
  };

  return collection.deleteOne(query, filterOptions);
};

export const updateMany = (collection, params) => {
  const { query, update: updatePayload, options: updateOptions } = {
    query: {},
    options: {},
    ...params,
  };

  return collection.updateMany(query, updatePayload, updateOptions);
};

export const updateOne = (collection, params) => {
  const { query, update: updatePayload, options: updateOptions } = {
    query: {},
    options: {},
    ...params,
  };

  return collection.updateOne(query, updatePayload, updateOptions);
};

export const count = (collection, params) => {
  const { query, options } = params;
  return collection.count(query || {}, options || {});
};

export const aggregate = (collection, params) => {
  const { pipeline, options } = params;
  return collection.aggregate(pipeline, options);
};
