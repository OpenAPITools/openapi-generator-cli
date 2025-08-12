import { AppModule } from './app.module';
import { Test } from '@nestjs/testing';
import { PassThroughService, VersionManagerService } from './services';
import { of } from 'rxjs';
import { COMMANDER_PROGRAM } from './constants';

describe('AppModule', () => {
  let fixture: AppModule;

  const programMock = {
    parse: jest.fn(),
  };

  const passThroughServiceMock = {
    init: jest.fn(),
  };

  const versionManagerServiceMock = {
    getSelectedVersion: jest.fn(),
    setSelectedVersion: jest.fn(),
    downloadIfNeeded: jest.fn(),
    search: jest.fn(),
  };

  beforeEach(async () => {
    [
      ...Object.values(versionManagerServiceMock),
      ...Object.values(passThroughServiceMock),
      ...Object.values(programMock),
    ].forEach((spy) => spy.mockReset());

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: COMMANDER_PROGRAM, useValue: programMock },
        { provide: VersionManagerService, useValue: versionManagerServiceMock },
        { provide: PassThroughService, useValue: passThroughServiceMock },
      ],
    }).compile();

    fixture = new AppModule(
      moduleRef.get(COMMANDER_PROGRAM),
      moduleRef.get(VersionManagerService),
      moduleRef.get(PassThroughService),
    );
  });

  describe('lifecycles', () => {
    describe('onApplicationBootstrap()', () => {
      beforeEach(() => {
        process.argv = ['foo', 'baz'];

        programMock.parse.mockImplementation(() => {
          expect(passThroughServiceMock.init).toHaveBeenCalledTimes(1);
          expect(
            versionManagerServiceMock.downloadIfNeeded,
          ).toHaveBeenCalledTimes(1);
        });
      });

      describe('the selected version is not set', () => {
        beforeEach(async () => {
          versionManagerServiceMock.getSelectedVersion.mockReturnValue(
            undefined,
          );
          versionManagerServiceMock.search.mockReturnValue(
            of([{ version: '4.5.6' }]),
          );
          await fixture.onApplicationBootstrap();
        });

        it('searches and selects the latest version ', () => {
          expect(versionManagerServiceMock.search).toHaveBeenNthCalledWith(1, [
            'latest',
          ]);
          expect(
            versionManagerServiceMock.setSelectedVersion,
          ).toHaveBeenNthCalledWith(1, '4.5.6');
        });

        it('downloads the version, if needed', () => {
          expect(
            versionManagerServiceMock.downloadIfNeeded,
          ).toHaveBeenNthCalledWith(1, '4.5.6');
        });

        it('parses the command', () => {
          expect(programMock.parse).toHaveBeenNthCalledWith(1, process.argv);
        });
      });

      describe('the selected version is set', () => {
        beforeEach(async () => {
          versionManagerServiceMock.getSelectedVersion.mockReturnValue('1.2.3');
          await fixture.onApplicationBootstrap();
        });

        it('does not search for the latest version ', () => {
          expect(versionManagerServiceMock.search).toHaveBeenCalledTimes(0);
        });

        it('does not set the selected version ', () => {
          expect(
            versionManagerServiceMock.setSelectedVersion,
          ).toHaveBeenCalledTimes(0);
        });

        it('downloads the version, if needed', () => {
          expect(
            versionManagerServiceMock.downloadIfNeeded,
          ).toHaveBeenNthCalledWith(1, '1.2.3');
        });

        it('parses the command', () => {
          expect(programMock.parse).toHaveBeenNthCalledWith(1, process.argv);
        });
      });
    });
  });
});
