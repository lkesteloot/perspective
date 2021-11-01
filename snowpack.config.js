module.exports = {
    plugins: ['@snowpack/plugin-typescript'],
    buildOptions: {
        out: "docs",
    },
    mount: {
        "src": "/",
    },
};
