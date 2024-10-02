{
  description = "OpenAPI generator CLI nix flake";

  inputs.nixpkgs.url = "github:nixos/nixpkgs";  
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell
          {
            buildInputs = with pkgs;[
              # These dependencies match the github workflows
              # yarn 1.x
              yarn
              # nodejs without npm
              nodejs-slim_18
            ];
          };
      }
    );
}

