import * as configSchema from '../../config.schema.json';

describe('config schema', () => {
  it('defines repository settings as standard object properties', () => {
    const repository =
      configSchema.properties['generator-cli'].properties.repository;

    expect(repository.type).toBe('object');
    expect(repository.properties).toEqual(
      expect.objectContaining({
        queryUrl: expect.objectContaining({ type: 'string' }),
        downloadUrl: expect.objectContaining({ type: 'string' }),
        username: expect.objectContaining({ type: 'string' }),
        password: expect.objectContaining({ type: 'string' }),
      })
    );
  });
});
