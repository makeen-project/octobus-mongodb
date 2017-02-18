import Joi from 'joi';
import { decorators } from 'octobus.js';
import Store from './Store';

const { withSchema } = decorators;

export default (namespace, options = {}) => {
  const parsedOptions = Joi.attempt(options, {
    store: Joi.object().type(Store).required(),
    schema: Joi.object(),
  });

  const { schema } = parsedOptions;

  const store = new Proxy(parsedOptions.store, {
    get(target, method) {
      return method in target ? target[method] : target.getCollection()[method];
    },
  });

  const map = {
    query: withSchema(Joi.func().required())(
      ({ params: cb }) => cb(store),
    ),

    findById: withSchema(Joi.any().required())(
      ({ params }) => store.findById(params),
    ),

    findOne: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      }),
    )(
      ({ params = {} }) => store.findOne(params),
    ),

    findMany: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        orderBy: Joi.any(),
        limit: Joi.number(),
        skip: Joi.number(),
        fields: Joi.any(),
      }),
    )(
      ({ params = {} }) => store.findMany(params),
    ),

    createOne({ dispatch, params }) {
      return dispatch(`${namespace}.save`, params);
    },

    createMany: withSchema(
      Joi.array().min(1).required(),
    )(
      ({ dispatch, params }) => Promise.all(
        params.map(item => dispatch(`${namespace}.save`, item)),
      ),
    ),

    updateOne: withSchema(
      Joi.object().keys({
        update: Joi.object().required(),
      }).unknown(true).required(),
    )(
      ({ params }) => (
        store.updateOne(params)
      ),
    ),

    updateMany: withSchema(
      Joi.object().keys({
        update: Joi.object().required(),
      }).unknown(true).required(),
    )(
      ({ params }) => (
        store.updateMany(params)
      ),
    ),

    replaceOne: withSchema(
      Joi.object().unknown(true).required(),
    )(
      ({ dispatch, params }) => dispatch(`${namespace}.save`, params),
    ),

    async save({ params, dispatch }) {
      const data = await dispatch(`${namespace}.validate`, params);
      return store.save(data);
    },

    deleteOne: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      }),
    )(
      async ({ params }) => store.deleteOne(params),
    ),

    deleteMany: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      }),
    )(
      async ({ params }) => store.deleteMany(params),
    ),

    count: withSchema(
      Joi.object().keys({
        query: Joi.object(),
        options: Joi.object(),
      }),
    )(
      ({ params }) => store.count(params),
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
