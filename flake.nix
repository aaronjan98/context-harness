{
  description = "Context Forge development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      pythonEnv = pkgs.python312.withPackages (ps: with ps; [
        fastapi
        uvicorn
        httpx
        mcp
        pytest
        python-multipart
        pyyaml
        websockets
      ]);
    in {
      devShells.${system}.default = pkgs.mkShell {
        packages = [ pythonEnv pkgs.git ];

        shellHook = ''
          echo "Context Forge dev environment"
          echo "  uvicorn server.main:app --port 8000 --reload --host ::"
          echo "    (--host :: binds dual-stack so localhost, which resolves to ::1, is reachable from Firefox/the extension)"
          echo "  open the API docs at http://127.0.0.1:8000/docs"
        '';
      };
    };
}
