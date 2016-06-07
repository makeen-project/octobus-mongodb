export const paramsToCursor = (collection, params = {}) => {
  const { query, fields, orderBy, limit, skip } = {
    query: {},
    fields: {},
    ...params,
  };

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
