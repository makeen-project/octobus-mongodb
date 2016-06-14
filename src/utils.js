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

export const expand = (dispatch, result, refs = [], refsConfig) => {
  if (!refs.length) {
    return result;
  }

  if (Array.isArray(result)) {
    const refsMap = {};
    result.forEach((item) => {
      refs.forEach(({ refId }) => {
        if (!refsMap[refId]) {
          refsMap[refId] = [];
        }

        if (Array.isArray(item[refId])) {
          refsMap[refId].push(...item[refId]);
        } else {
          refsMap[refId].push(item[refId]);
        }
      });
    });

    return Promise.all(
      refs.map(({ refId }) => {
        const refConfig = refsConfig.find(({ refId: _refId }) => _refId === refId);
        return dispatch(`entity.${refConfig.refEntity}.findMany`, {
          query: {
            _id: {
              $in: refsMap[refId],
            },
          },
        }).then((c) => c.toArray());
      })
    ).then((expandedReferences) => (
      result.map((item) => (
        refs.reduce((acc, { as, refId }, index) => ({
          ...acc,
          [as]: Array.isArray(item[refId]) ?
            expandedReferences[index].filter(
              ({ _id }) => item[refId].find((itemRefId) => itemRefId.toString() === _id.toString())
            ) :
            expandedReferences[index].find(({ _id }) => _id === item[refId]),
        }), item)
      ))
    ));
  }

  return Promise.all(
    refs.map(({ refId }) => {
      const refConfig = refsConfig.find(({ refId: _refId }) => _refId === refId);
      if (Array.isArray(result[refId])) {
        return dispatch(`entity.${refConfig.refEntity}.findMany`, {
          query: {
            _id: {
              $in: result[refId],
            },
          },
        }).then((c) => c.toArray());
      }

      return dispatch(`entity.${refConfig.refEntity}.findById`, result[refId]);
    })
  ).then((expandedReferences) => (
    refs.reduce((acc, { as }, index) => ({
      ...acc,
      [as]: expandedReferences[index],
    }), result)
  ));
};
