import _ from 'lodash';

export const paramsToCursor = (collection, params = {}) => {
  const { query, orderBy, limit, skip } = {
    query: {},
    ...params,
  };

  let fields = params.fields || {};

  if (Array.isArray(fields)) {
    fields = fields.reduce((acc, field) => ({
      ...acc,
      [field]: 1,
    }), {});
  }

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

export const extractCollectionName = (namespace) => {
  const lastIndex = namespace.lastIndexOf('.');
  return lastIndex > -1 && namespace.substr(lastIndex + 1);
};

export const addTimestamps = (data, { createKey, updateKey }) => {
  _.set(data, updateKey, new Date());

  if (!data._id) {
    _.set(data, createKey, new Date());
  }
};

export const addTimestampToUpdate = (update, { updateKey }) => {
  let { $set } = update;
  if (!$set) {
    $set = {};
  }

  $set[updateKey] = new Date();

  return {
    ...update,
    $set,
  };
};
