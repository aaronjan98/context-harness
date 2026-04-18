{
  description = "agent-display development environment";

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
        pyyaml
        websockets
      ]);
    in {
      devShells.${system}.default = pkgs.mkShell {
        packages = [ pythonEnv pkgs.git ];

        shellHook = ''
          echo "agent-display dev environment"
          echo "  uvicorn server.main:app --port 5050 --reload"
          echo "  open the API docs at http://127.0.0.1:5050/docs"
        '';
      };
    };
}
