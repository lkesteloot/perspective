module.exports = {
    plugins: ['@snowpack/plugin-typescript'],
    buildOptions: {
        out: "dist",
    },
    mount: {
        "src": "/",
    },
};
